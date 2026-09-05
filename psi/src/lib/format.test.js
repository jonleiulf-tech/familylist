import { describe, it, expect } from 'vitest';
import { paragraphs, fmtDate, timeRange, excerpt } from './format.js';
import { matchPath } from './router.jsx';
import { splitLang, withLang, pick } from './i18n.jsx';

describe('paragraphs', () => {
  it('deler på linjeskift og fjerner tomme', () => {
    expect(paragraphs('a\n\nb\n c ')).toEqual(['a', 'b', 'c']);
    expect(paragraphs(null)).toEqual([]);
  });
});

describe('fmtDate', () => {
  it('formaterer på begge språk', () => {
    expect(fmtDate('2026-09-11', 'nb')).toBe('11. sep 2026');
    expect(fmtDate('2026-09-11', 'en')).toBe('11 Sep 2026');
  });
  it('lar ugyldig input passere', () => {
    expect(fmtDate('snart', 'nb')).toBe('snart');
  });
});

describe('timeRange', () => {
  it('bruker tankestrek', () => {
    expect(timeRange({ from: '18:00', to: '20:00' })).toBe('18:00–20:00');
  });
});

describe('matchPath', () => {
  it('matcher parametre og avviser feil lengde', () => {
    expect(matchPath('/idretter/:slug', '/idretter/fotball')).toEqual({ slug: 'fotball' });
    expect(matchPath('/idretter/:slug', '/idretter')).toBe(null);
    expect(matchPath('/', '/')).toEqual({});
    expect(matchPath('/om', '/idretter')).toBe(null);
  });
});

describe('språk i URL', () => {
  it('skiller ut /en og legger det på igjen', () => {
    expect(splitLang('/en/idretter/fotball')).toEqual({ lang: 'en', path: '/idretter/fotball' });
    expect(splitLang('/en')).toEqual({ lang: 'en', path: '/' });
    expect(splitLang('/english')).toEqual({ lang: 'nb', path: '/english' });
    expect(splitLang('/')).toEqual({ lang: 'nb', path: '/' });
    expect(withLang('/', 'en')).toBe('/en');
    expect(withLang('/bli-med', 'en')).toBe('/en/bli-med');
    expect(withLang('/bli-med', 'nb')).toBe('/bli-med');
  });
  it('plukker riktig språk og faller tilbake til norsk', () => {
    expect(pick({ nb: 'Hei', en: 'Hi' }, 'en')).toBe('Hi');
    expect(pick({ nb: 'Hei' }, 'en')).toBe('Hei');
    expect(pick('Porsgrunn Arena', 'en')).toBe('Porsgrunn Arena');
    expect(pick(null, 'en')).toBe(null);
  });
});

describe('excerpt', () => {
  it('lar korte tekster stå urørt', () => {
    expect(excerpt('Kort melding.')).toBe('Kort melding.');
    expect(excerpt('')).toBe('');
    expect(excerpt(null)).toBe('');
  });
  it('klipper ved ordgrense og markerer at det er mer', () => {
    const lang = 'Vi trenger dommere til sjuerfotball under cupen i morgen, meld deg gjerne i Spond så fort du kan, det haster litt for oss nå';
    const kort = excerpt(lang, 60);
    expect(kort.length).toBeLessThanOrEqual(64);
    expect(kort.endsWith(' …')).toBe(true);
    expect(lang.startsWith(kort.replace(' …', ''))).toBe(true);   // ikke midt i et ord
  });
  it('slår sammen linjeskift til mellomrom', () => {
    expect(excerpt('Hei\n\nalle   sammen')).toBe('Hei alle sammen');
  });
  it('lar ikke tegnsetting henge igjen foran ellipsen', () => {
    expect(excerpt('Ja, dette er en ganske lang setning som må klippes et sted', 12)).not.toMatch(/[,-] …$/);
  });
});
