import { createContext, useContext } from 'react';
import { strings } from '../i18n/strings.js';

/* Språk. Norsk er standard og ligger på /, engelsk på /en/….
   t(x): plukker riktig språk fra et { nb, en }-objekt i datafila, og lar
   vanlige strenger passere uendret. */
export const LANGS = ['nb', 'en'];
export const LangCtx = createContext('nb');

export function useLang() {
  return useContext(LangCtx);
}

export function useStrings() {
  return strings[useLang()];
}

export function useT() {
  const lang = useLang();
  return (x) => pick(x, lang);
}

export function pick(x, lang) {
  if (x == null) return x;
  if (typeof x === 'object' && !Array.isArray(x) && ('nb' in x || 'en' in x)) return x[lang] || x.nb || x.en || '';
  return x;
}

/* Hvilket språk teksten faktisk endte på. Mangler den engelske
   varianten, får leseren den norske – og da må elementet merkes
   lang="nb", ellers leser skjermleseren norsk med engelsk uttale.
   Returnerer null når teksten er på språket leseren ba om. */
export function pickLang(x, lang) {
  if (x == null || typeof x !== 'object' || Array.isArray(x)) return null;
  if (!('nb' in x || 'en' in x)) return null;
  if (x[lang]) return null;
  return x.nb ? 'nb' : x.en ? 'en' : null;
}

export function useTLang() {
  const lang = useLang();
  return (x) => pickLang(x, lang);
}

/* '/en/idretter' → { lang: 'en', path: '/idretter' } */
export function splitLang(pathname) {
  const m = pathname.match(/^\/en(\/|$)/);
  if (m) return { lang: 'en', path: pathname.slice(3) || '/' };
  return { lang: 'nb', path: pathname || '/' };
}

export function withLang(path, lang) {
  if (lang === 'nb') return path;
  return path === '/' ? '/en' : `/en${path}`;
}
