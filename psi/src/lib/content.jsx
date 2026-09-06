import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as file from '../data/psi.js';
import { supabase, hasBackend } from './supabase.js';
import { erAktiv, erPauset, erSynlig } from './gruppestatus.js';

/* Ett sted alle sider henter innhold fra.

   Start: innholdet i src/data/psi.js, så siden tegnes umiddelbart.
   Med Supabase: tabellene `content` (site, organization, stats, partners)
   og `sports` leses og legges over. Har databasen ingen rader ennå,
   brukes fila. Sidene bryr seg ikke om hvilken kilde det er. */

export function fileContent() {
  return {
    site: file.site,
    organization: file.organization,
    stats: file.stats,
    partners: file.partners,
    sports: file.sports,
    // Bare i databasen. Uten Supabase er de tomme, og sidene skjuler seksjonene.
    news: [],
    events: [],
    media: [],
    board: [],
  };
}

/* Ren funksjon, testet for seg: databaserader over filinnhold. */
/* Fokuspunkt som object-position. Mangler kolonnene (før migrasjon 0007)
   faller vi tilbake til midten, som er slik det alltid har vært. */
export function focusOf(m) {
  const x = Number.isFinite(m?.focus_x) ? m.focus_x : 50;
  const y = Number.isFinite(m?.focus_y) ? m.focus_y : 50;
  return `${x}% ${y}%`;
}

/* Partnerne redigeres i admin, men logofilene og medlemsfordelene bor i
   repoet og står ikke i raden databasen lagrer. Uten dette faller en partner tilbake til navnet
   som tekst så snart noen har rørt lista i admin. Samme grunn som at
   idrettene mistet bildet sitt. */
function medLogoFraFila(fraDb, fraFila = []) {
  const fil = new Map(fraFila.flatMap((p) => [[p.name, p], [p.shortName, p]].filter(([k]) => k)));
  return fraDb.map((p) => {
    const f = fil.get(p.name) || fil.get(p.shortName) || {};
    return {
      ...p,
      logo: p.logo || f.logo || null,
      logoBackground: p.logoBackground || f.logoBackground,
      logoSourcePage: p.logoSourcePage || f.logoSourcePage,
      // Medlemsfordelen ligger i fila til noen skriver den i admin.
      offer: p.offer?.title || p.offer?.body ? p.offer : f.offer,
    };
  });
}

export function mergeContent(base, rows) {
  const out = { ...base };
  for (const row of rows.content || []) {
    if (!(row.key in out) || row.value == null) continue;
    out[row.key] = row.key === 'partners' && Array.isArray(row.value)
      ? medLogoFraFila(row.value, base.partners)
      : row.value;
  }
  if (rows.sports && rows.sports.length > 0) {
    // Databasen bestemmer innholdet, men bildefilene bor i repoet og står
    // ikke i sports.data. Uten dette faller idrettene tilbake til
    // plassholderen så snart noen tar bort gruppebildet i admin.
    const fil = new Map((base.sports || []).map((s) => [s.slug, s]));
    out.sports = [...rows.sports]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((r) => {
        const f = fil.get(r.slug) || {};
        const d = r.data || {};
        return {
          ...d,
          slug: r.slug,
          active: r.active,
          sort_order: r.sort_order,
          image: d.image || f.image || null,
          // Fila beholdes ved siden av, som reserve hvis bildet fra
          // databasen ikke lar seg laste.
          imageFile: f.image || null,
          imageAlt: d.imageAlt || f.imageAlt,
          imageCredit: d.imageCredit || f.imageCredit,
          glyph: d.glyph || f.glyph,
        };
      });
  }
  out.news = (rows.news || []).filter((n) => n.status === 'published' && !n.hidden_by_admin);
  out.events = (rows.events || []).filter((e) => e.status !== 'draft' && !e.hidden_by_admin);
  out.media = rows.media || [];
  out.board = rows.board || [];
  // Gruppebilde fra opplastede bilder: is_cover vinner over image i fila.
  // Fokuspunktet følger med, så utsnittet treffer det som betyr noe.
  const covers = out.media.filter((m) => m.is_cover && m.web_url);
  if (covers.length) {
    out.sports = out.sports.map((sp) => {
      const cover = covers.find((m) => m.sport_slug === sp.slug);
      return cover ? { ...sp, image: cover.web_url, imageAlt: cover.caption || sp.imageAlt, imageCredit: cover.credit || sp.imageCredit, imageFocus: focusOf(cover) } : sp;
    });
  }
  return out;
}

export function derive(content) {
  const activeSports = content.sports.filter(erAktiv);
  /* Grupper som er satt på pause: siden og historikken står, men de er
     ikke i drift. De hører hjemme nederst på /idretter, ikke blandet
     inn blant dem man kan melde seg på. */
  const pausedSports = content.sports.filter(erPauset);
  /* Alt som har en egen side – aktive og pausede. */
  const visibleSports = content.sports.filter(erSynlig);
  const findSport = (slug) => visibleSports.find((s) => s.slug === slug) || null;
  /* Også gruppene som er lagt ned. En gammel nyhet fra en avviklet
     gruppe skal fortsatt stå med gruppas navn – ikke merkes «Hele PSI»
     som om den var en fellesmelding. */
  const findAnySport = (slug) => content.sports.find((s) => s.slug === slug) || null;
  /* Grunnskjemaet for uka. Økter som er over, tas bort – ellers sier
     /treningstider noe annet enn /kalender, som allerede regner med
     until_date. */
  const weeklySchedule = (idag = new Date().toISOString().slice(0, 10)) => {
    const rows = [];
    for (const s of activeSports) {
      for (const slot of s.schedule || []) {
        if (slot.until_date && slot.until_date < idag) continue;
        rows.push({ ...slot, sport: s });
      }
    }
    return rows.sort((a, b) => a.day - b.day || (a.from || '').localeCompare(b.from || ''));
  };
  const news = content.news || [];
  const events = content.events || [];
  const media = content.media || [];
  const newsFor = (slug) => news.filter((n) => (slug ? n.sport_slug === slug || n.sport_slug == null : true));
  const eventsFor = (slug) => events.filter((e) => (slug ? e.sport_slug === slug || e.sport_slug == null : true));
  const galleryFor = (slug) => media.filter((m) => m.show_in_gallery && (slug ? m.sport_slug === slug : true));
  /* Hovedgalleriet er felles for hele PSI: bildene noen har løftet dit,
     uansett gruppe. Bilder uten gruppe som lå i galleriet fra før regnes
     med, så ingenting forsvinner før migrasjon 0009 er kjørt. */
  const mainGallery = () => media.filter((m) => m.show_in_main || (!m.sport_slug && m.show_in_gallery));
  const findNews = (slugOrId) => news.find((n) => n.slug === slugOrId || n.id === slugOrId) || null;
  /* Antall aktive grupper telles, ikke skrives. Sto tallet i datafila,
     måtte noen huske å endre det hver gang en gruppe kom til – og det
     blir feil med det samme noen glemmer det. */
  const stats = { ...(content.stats || {}), activeSports: activeSports.length };
  return {
    ...content,
    stats,
    news,
    events,
    media,
    board: content.board || [],
    activeSports,
    pausedSports,
    visibleSports,
    findSport,
    findAnySport,
    weeklySchedule,
    newsFor,
    eventsFor,
    galleryFor,
    mainGallery,
    findNews,
  };
}

export function mediaUrl(path) {
  if (!path || !supabase) return null;
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
}

/* Bildene, med en trygg vei tilbake.

   Nevner spørringen en kolonne databasen ikke har ennå, avviser PostgREST
   hele spørringen – og da forsvinner ikke bare det nye, men alle bilder på
   hele nettsiden: gruppebilder, nyhetsbilder, gallerier. Det er en for høy
   pris for én kolonne. Så vi prøver den nye formen først og faller tilbake
   til den gamle når migrasjonen ikke er kjørt ennå. */
export const MEDIA_BASIS = 'id, sport_slug, web_path, path, width, height, caption, credit, show_in_gallery, show_on_home, is_cover, sort_order';
export const MEDIA_NY = `${MEDIA_BASIS}, show_in_main, focus_x, focus_y, description`;
const SYNLIG_BASIS = 'show_in_gallery.eq.true,show_on_home.eq.true,is_cover.eq.true';
const SYNLIG_NY = `${SYNLIG_BASIS},show_in_main.eq.true`;

export async function hentMedia(db = supabase) {
  const ny = await db.from('media').select(MEDIA_NY).or(SYNLIG_NY).order('sort_order');
  if (!ny.error) return ny;
  return db.from('media').select(MEDIA_BASIS).or(SYNLIG_BASIS).order('sort_order');
}

export async function fetchContent() {
  const since = new Date(Date.now() - 2 * 86400e3).toISOString();
  const [c, s, n, e, m, b] = await Promise.all([
    supabase.from('content').select('key, value'),
    supabase.from('sports').select('slug, sort_order, active, data'),
    supabase.from('news').select('id, slug, sport_slug, title, lead, body, image_id, link_url, status, published_at, show_on_home').eq('status', 'published').order('published_at', { ascending: false }).limit(300),
    supabase.from('events').select('*').neq('status', 'draft').gte('starts_at', since).order('starts_at').limit(200),
    hentMedia(),
    supabase.from('public_board').select('*').order('sort_order'),
  ]);
  // De tre første må virke. Resten kom i migrasjon 0002 og kan mangle.
  if (c.error) throw c.error;
  if (s.error) throw s.error;
  const media = (m.data || []).map((row) => ({ ...row, web_url: mediaUrl(row.web_path), url: mediaUrl(row.path) }));
  return { content: c.data, sports: s.data, news: n.data || [], events: e.data || [], media, board: b.data || [] };
}

const Ctx = createContext(derive(fileContent()));

export function ContentProvider({ children }) {
  const [content, setContent] = useState(fileContent);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!hasBackend) return;
    let alive = true;
    fetchContent()
      .then((rows) => alive && setContent(mergeContent(fileContent(), rows)))
      .catch(() => { /* databasen nede: fila står */ });
    return () => { alive = false; };
  }, [version]);

  const value = useMemo(() => ({ ...derive(content), reload: () => setVersion((v) => v + 1) }), [content]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useContent() {
  return useContext(Ctx);
}
