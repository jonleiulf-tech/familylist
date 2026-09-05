/* Selve logikken bak oppsettsjekken, skilt fra visningen så den kan testes.

   Går innlogging galt, er årsaken nesten alltid ett av fire steg. Denne
   kjører dem i rekkefølge og stopper ved første som feiler, med hva som
   fikser det. Ingen hemmeligheter vises: bare adressen til prosjektet,
   som uansett ligger i hver eneste forespørsel nettleseren sender. */

export const TIDSFRIST_MS = 8000;

/* En hengende forespørsel skal ikke gi «Sjekker …» i det uendelige. */
export function medTidsfrist(løfte, ms = TIDSFRIST_MS) {
  return Promise.race([
    Promise.resolve(løfte),
    new Promise((_, avvis) => setTimeout(() => avvis(new Error('tidsfrist')), ms)),
  ]);
}

const erTidsfrist = (e) => e && e.message === 'tidsfrist';

function ikkeSvar(navn, err) {
  return {
    navn,
    status: 'feil',
    forklaring: erTidsfrist(err)
      ? 'Databasen svarte ikke i tide.'
      : `Fikk ikke kontakt: ${err?.message ?? 'ukjent feil'}`,
    fiks: 'Sjekk at Supabase-prosjektet er aktivt. Gratisprosjekter settes på pause etter en uke uten bruk, og må startes igjen fra dashbordet.',
  };
}

export function byggForklaring(info) {
  if (!info) return null;
  const funnet = info.nøkler.length ? info.nøkler.join(', ') : 'ingen';
  const deler = [`Bygget kjenner disse VITE-variablene: ${funnet}.`];
  if (info.urlRå == null) deler.push('VITE_SUPABASE_URL nådde aldri bygget.');
  else if (!info.urlGodtatt) deler.push(`VITE_SUPABASE_URL er satt til «${info.urlRå}», som ikke er en gyldig adresse.`);
  else deler.push(`VITE_SUPABASE_URL er «${info.urlRå}».`);
  deler.push(info.nøkkelLengde ? `Nøkkelen er ${info.nøkkelLengde} tegn lang.` : 'VITE_SUPABASE_ANON_KEY nådde aldri bygget.');
  return deler.join(' ');
}

export async function kjørSjekk(client, origin = '', byggInfo = null) {
  const ut = [];

  // 1. Miljøvariabler i Vercel
  if (!client) {
    return [{
      navn: 'Miljøvariabler i Vercel',
      status: 'feil',
      forklaring: byggForklaring(byggInfo) || 'VITE_SUPABASE_URL eller VITE_SUPABASE_ANON_KEY mangler, eller adressen er ugyldig.',
      fiks: 'Vercel → Settings → Environment Variables. Adressen skal være https://<ref>.supabase.co, uten /rest/v1/ bakerst. Kjør Redeploy etterpå: variablene bakes inn under bygget, så en endring uten nytt bygg gjør ingenting.',
    }];
  }
  let vert = 'Supabase';
  try { vert = new URL(client.supabaseUrl).hostname; } catch { /* vis standardteksten */ }
  ut.push({ navn: 'Miljøvariabler i Vercel', status: 'ok', forklaring: `Nettsiden peker på ${vert}.` });

  // 2. Tabellene fra schema.sql
  let tabellFeil;
  try {
    ({ error: tabellFeil } = await medTidsfrist(client.from('content').select('key').limit(1)));
  } catch (err) {
    ut.push(ikkeSvar('Tabellene i databasen', err));
    return ut;
  }
  if (tabellFeil) {
    const mangler = /does not exist|schema cache|42P01|relation/i.test(tabellFeil.message || '');
    const ugyldigNøkkel = /JWT|api key|Invalid/i.test(tabellFeil.message || '');
    ut.push({
      navn: 'Tabellene i databasen',
      status: 'feil',
      forklaring: mangler ? 'Tabellen content finnes ikke.' : tabellFeil.message,
      fiks: mangler
        ? 'Kjør hele psi/supabase/schema.sql i Supabase → SQL Editor → New query → Run. Hele fila, ikke deler av den.'
        : ugyldigNøkkel
          ? 'Anon-nøkkelen ser ikke ut til å høre til dette prosjektet. Hent den på nytt under Project Settings → API.'
          : 'Sjekk at nøkkelen og adressen hører til samme Supabase-prosjekt.',
    });
    return ut;
  }
  ut.push({ navn: 'Tabellene i databasen', status: 'ok', forklaring: 'content og sports svarer.' });

  // 3. Tilgangsfunksjonen
  let rpcFeil, erAdmin;
  try {
    ({ data: erAdmin, error: rpcFeil } = await medTidsfrist(client.rpc('is_admin')));
  } catch (err) {
    ut.push(ikkeSvar('Tilgangsfunksjonen is_admin', err));
    return ut;
  }
  if (rpcFeil) {
    ut.push({
      navn: 'Tilgangsfunksjonen is_admin',
      status: 'feil',
      forklaring: rpcFeil.message,
      fiks: 'Kjør schema.sql på nytt, hele fila. Funksjonen is_admin opprettes der.',
    });
    return ut;
  }
  ut.push({
    navn: 'Tilgangsfunksjonen is_admin',
    status: 'ok',
    forklaring: erAdmin === true ? 'Adressen din står på tilgangslista.' : 'Funksjonen svarer. Du er ikke logget inn som admin ennå.',
  });

  // 4. Adressen innloggingslenken sender deg tilbake til
  ut.push({
    navn: 'Redirect-adresse i Supabase',
    status: 'ok',
    forklaring: `Innloggingslenken sender deg til ${origin}/admin`,
    fiks: `Denne adressen må stå under Authentication → URL Configuration → Redirect URLs, og Site URL bør være ${origin}. Mangler den, havner du på feil sted når du klikker lenken i e-posten, ofte på localhost.`,
  });

  return ut;
}
