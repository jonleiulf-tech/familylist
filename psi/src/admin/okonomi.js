/* Databasetilgang for økonomien. Regnestykkene ligger i
   src/lib/okonomi.js; her er bare hentingen og skrivingen.

   Alt går gjennom RLS: en gruppeleder får se og skrive sin egen gruppe,
   PSI-admin alt. Vi filtrerer ikke i klienten – det ville bare vært en
   høflighet, og databasen sier nei uansett (se
   supabase/tester/okonomi-tilgang.sql). */
import { supabase } from '../lib/supabase.js';
import { manglerMigrasjon } from './api.jsx';

export const BØTTE = 'bilag';
export const MAKS_BYTES = 25 * 1024 * 1024;
export const GODTAR = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf';

/* Felles PSI har ingen slug, men filene må ligge et sted. «psi» er samme
   mappenavn som bildene bruker, og tilgangsregelen i 0012 kjenner det. */
export const mappe = (slug) => slug || 'psi';

export function filFeil(fil) {
  if (!fil) return 'Ingen fil.';
  if (fil.size > MAKS_BYTES) return `Fila er ${(fil.size / 1048576).toFixed(0)} MB. Maks er 25 MB.`;
  const ok = /^image\/(jpeg|png|webp|heic|heif)$/.test(fil.type) || fil.type === 'application/pdf' || /\.(heic|heif|pdf)$/i.test(fil.name);
  return ok ? null : 'Bare bilder (JPG, PNG, WebP, HEIC) eller PDF.';
}

/* Trygt filnavn. Æ, Ø og Å i en storage-sti gir vondt vondt senere. */
export function trygtNavn(navn) {
  // Æ og Ø har ingen dekomponert form, så de må byttes ut for hånd – og
  // med samme kasus, ellers blir «ÆØÅ» til «aeoA».
  const rent = String(navn || 'bilag')
    .replace(/Æ/g, 'AE').replace(/æ/g, 'ae')
    .replace(/Ø/g, 'O').replace(/ø/g, 'o')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  return (rent || 'bilag').slice(0, 80);
}

export async function hentØkonomi(client = supabase) {
  const [perioder, tildeling, poster, bilag, utlegg] = await Promise.all([
    client.from('budsjett_perioder').select('*').order('ar', { ascending: false }).order('semester'),
    client.from('budsjett_tildeling').select('*'),
    client.from('budsjett_poster').select('*').order('sort_order').order('aktivitet'),
    client.from('bilag').select('*').order('dato', { ascending: false }),
    client.from('utlegg').select('*').order('created_at', { ascending: false }),
  ]);
  // Uten migrasjon 0012 finnes ingenting av dette. Da skal admin si det,
  // ikke framstå som nede.
  const mangler = [perioder, tildeling, poster, bilag, utlegg].some((r) => manglerMigrasjon(r.error));
  if (mangler) return { mangler: true, perioder: [], tildeling: [], poster: [], bilag: [], utlegg: [] };
  const feil = [perioder, tildeling, poster, bilag, utlegg].find((r) => r.error);
  if (feil) throw feil.error;
  return {
    mangler: false,
    perioder: perioder.data || [],
    tildeling: tildeling.data || [],
    poster: poster.data || [],
    bilag: bilag.data || [],
    utlegg: utlegg.data || [],
  };
}

/* Bøtta er lukket, så filene hentes med en signert lenke. Ti minutter er
   nok til å se på en kvittering, og kort nok til at en lenke som havner
   på avveie er verdiløs når noen finner den. */
export async function signertLenke(path, sekunder = 600, client = supabase) {
  if (!path) return null;
  const { data, error } = await client.storage.from(BØTTE).createSignedUrl(path, sekunder);
  return error ? null : data?.signedUrl || null;
}

export async function hentBytes(path, client = supabase) {
  if (!path) return null;
  const { data, error } = await client.storage.from(BØTTE).download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

export const db = {
  async lastOppBilag(fil, { sportSlug, rad, client = supabase }) {
    const feil = filFeil(fil);
    if (feil) return { error: { message: feil } };
    const path = `${mappe(sportSlug)}/${Date.now()}-${trygtNavn(fil.name)}`;
    const opp = await client.storage.from(BØTTE).upload(path, fil, {
      contentType: fil.type || 'application/octet-stream',
      upsert: false,
    });
    if (opp.error) return { error: opp.error };
    const inn = await client.from('bilag').insert({
      ...rad,
      sport_slug: sportSlug || null,
      fil_path: path,
      fil_navn: fil.name,
      mime: fil.type || null,
      storrelse: fil.size,
    }).select().single();
    // Ryddes opp om raden ikke gikk inn: en fil uten rad er en fil ingen
    // finner igjen, og bøtta fylles opp av dem.
    if (inn.error) { await client.storage.from(BØTTE).remove([path]); return { error: inn.error }; }
    return { data: inn.data };
  },

  lagreBilag: (rad, client = supabase) =>
    (rad.id
      ? client.from('bilag').update(utenNøkler(rad)).eq('id', rad.id).select().single()
      : client.from('bilag').insert(utenNøkler(rad)).select().single()),

  async slettBilag(rad, client = supabase) {
    if (rad.fil_path) await client.storage.from(BØTTE).remove([rad.fil_path]);
    return client.from('bilag').delete().eq('id', rad.id);
  },

  lagrePeriode: (rad, client = supabase) =>
    (rad.id ? client.from('budsjett_perioder').update(utenNøkler(rad)).eq('id', rad.id) : client.from('budsjett_perioder').insert(utenNøkler(rad))),

  /* Bare én periode kan være gjeldende. Databasen har en unik indeks som
     håndhever det, så den gamle må slås av først. */
  async settGjeldende(id, client = supabase) {
    const av = await client.from('budsjett_perioder').update({ gjeldende: false }).eq('gjeldende', true);
    if (av.error) return av;
    return client.from('budsjett_perioder').update({ gjeldende: true }).eq('id', id);
  },

  lagreTildeling: (rad, client = supabase) =>
    client.from('budsjett_tildeling').upsert(utenNøkler(rad), { onConflict: 'periode_id,sport_slug' }),

  lagrePost: (rad, client = supabase) =>
    (rad.id
      ? client.from('budsjett_poster').update(utenNøkler(rad)).eq('id', rad.id).select().single()
      : client.from('budsjett_poster').insert(utenNøkler(rad)).select().single()),
  slettPost: (id, client = supabase) => client.from('budsjett_poster').delete().eq('id', id),

  lagreUtlegg: (rad, client = supabase) =>
    (rad.id
      ? client.from('utlegg').update(utenNøkler(rad)).eq('id', rad.id).select().single()
      : client.from('utlegg').insert(utenNøkler(rad)).select().single()),
  slettUtlegg: (id, client = supabase) => client.from('utlegg').delete().eq('id', id),

  /* Kobler bilagene til utlegget og gir dem vedleggsnummer i den
     rekkefølgen de står. Nummeret må stemme med tabellen i PDF-en. */
  async knyttTilUtlegg(utleggId, bilagIder, client = supabase) {
    const løs = await client.from('bilag').update({ utlegg_id: null, bilagsnummer: null }).eq('utlegg_id', utleggId);
    if (løs.error) return løs;
    for (let i = 0; i < bilagIder.length; i += 1) {
      const r = await client.from('bilag').update({ utlegg_id: utleggId, bilagsnummer: String(i + 1) }).eq('id', bilagIder[i]);
      if (r.error) return r;
    }
    return { error: null };
  },

  settBilagStatus: (ider, status, client = supabase) =>
    client.from('bilag').update({ status }).in('id', ider),
};

/* updated_at og updated_by settes av databasen. Sender vi dem med, skriver
   vi over triggerens egen verdi med en foreldet en. */
const NØKLER = new Set(['updated_at', 'updated_by', 'created_at']);
function utenNøkler(rad) {
  return Object.fromEntries(Object.entries(rad).filter(([k]) => !NØKLER.has(k)));
}
