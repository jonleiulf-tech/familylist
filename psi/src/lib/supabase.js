import { createClient } from '@supabase/supabase-js';

/* Valgfritt. Uten disse to miljøvariablene kjører siden på src/data/psi.js
   og /admin er slått av. Med dem leses innholdet fra databasen.
   anon-nøkkelen er trygg i frontend: RLS styrer hva den får gjøre.

   Viktig: en skrivefeil her skal ALDRI kunne ta ned den offentlige siden.
   Derfor ryddes verdien først, og feiler den likevel, faller vi tilbake til
   datafila i stedet for å krasje. */

/* Godtar det folk faktisk limer inn fra Supabase: adressen med /rest/v1/
   bakerst, mellomrom rundt, eller uten https:// foran. */
export function normalizeUrl(raw) {
  if (typeof raw !== 'string') return null;
  let u = raw.trim().replace(/\/+$/, '');
  if (!u) return null;
  u = u.replace(/\/rest\/v1$/i, '').replace(/\/auth\/v1$/i, '');
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    const { origin, hostname } = new URL(u);
    // Et vertsnavn uten punktum eller med mellomrom er en skrivefeil.
    if (!hostname.includes('.') || /\s/.test(hostname)) return null;
    return origin;
  } catch {
    return null;
  }
}

const råUrl = import.meta.env.VITE_SUPABASE_URL;
const råKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const url = normalizeUrl(råUrl);
const key = (råKey || '').trim();

/* Hva bygget faktisk fikk med seg. Vises i oppsettsjekken når noe feiler,
   så man ser forskjell på «variabelen nådde aldri bygget» og «variabelen
   er der, men verdien er feil». Adressen er offentlig og vises som den er.
   Nøkkelen vises aldri, bare om den finnes og hvor lang den er. */
export const byggInfo = {
  nøkler: Object.keys(import.meta.env).filter((k) => k.startsWith('VITE_')),
  urlRå: typeof råUrl === 'string' ? råUrl : null,
  urlGodtatt: url,
  nøkkelLengde: typeof råKey === 'string' ? råKey.trim().length : 0,
  modus: import.meta.env.MODE,
};

/* Hvilken type lenke kom vi hit fra? Må leses FØR createClient kjører,
   for klienten plukker opp adressen med én gang og fjerner den delen av
   URL-en etterpå. Rekker vi ikke å se etter først, mister vi at dette var
   en gjenopprettingslenke, og brukeren havner rett i admin uten å få satt
   nytt passord. */
export function lenketypeFra(hash = '', search = '') {
  const rens = (v) => (v.startsWith('#') || v.startsWith('?') ? v.slice(1) : v);
  for (const del of [rens(hash), rens(search)]) {
    if (!del) continue;
    const type = new URLSearchParams(del).get('type');
    if (type) return type;
  }
  return null;
}

export const lenketype =
  typeof window === 'undefined'
    ? null
    : lenketypeFra(window.location.hash, window.location.search);

function connect() {
  if (!url || !key) return null;
  try {
    return createClient(url, key);
  } catch (err) {
    // Siden skal fortsatt virke. Meldingen hjelper den som satte variabelen.
    console.error('Supabase er feil satt opp, siden kjører videre på datafila:', err.message);
    return null;
  }
}

export const supabase = connect();
export const hasBackend = Boolean(supabase);
