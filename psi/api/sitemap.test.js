import { describe, it, expect } from 'vitest';
import { byggSitemap, urlBlokk, FASTE } from './sitemap.xml.js';

const DOMENE = 'https://psiusn.no';

const grupper = [
  { slug: 'fotball', status: 'aktiv' },
  { slug: 'klatring', status: 'pauset' },
  { slug: 'bordtennis', status: 'skjult' },
  { slug: 'padel', active: true },      // gammel rad uten status
];

describe('sitemap', () => {
  const xml = byggSitemap({ sports: grupper, news: [{ slug: 'semesterstart', published_at: '2026-08-20T10:00:00Z' }], domene: DOMENE, idag: '2026-09-06' });

  it('tar med alle faste sider på begge språk', () => {
    for (const sti of FASTE) {
      expect(xml).toContain(`<loc>${DOMENE}${sti === '/' ? '/' : sti}</loc>`);
      expect(xml).toContain(`<loc>${DOMENE}/en${sti === '/' ? '' : sti}</loc>`);
    }
  });

  it('tar med aktive og pausede grupper', () => {
    // Pausede sider står, og det er nettopp dem noen skal kunne finne og
    // starte opp igjen.
    expect(xml).toContain('/idretter/fotball<');
    expect(xml).toContain('/idretter/klatring<');
    expect(xml).toContain('/idretter/padel<');
  });

  it('utelater skjulte grupper', () => {
    expect(xml).not.toContain('bordtennis');
  });

  it('tar med nyheter, med sin egen dato', () => {
    expect(xml).toContain('/nyheter/semesterstart<');
    expect(xml).toContain('<lastmod>2026-08-20</lastmod>');
  });

  it('er gyldig XML med én urlset', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset')).toBe(true);
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
    const åpne = (xml.match(/<url>/g) || []).length;
    const lukke = (xml.match(/<\/url>/g) || []).length;
    expect(åpne).toBe(lukke);
    // To språk per side.
    expect(åpne).toBe((FASTE.length + 3 + 1) * 2);
  });

  it('gir hver adresse hreflang begge veier og x-default', () => {
    const blokk = urlBlokk(DOMENE, '/kalender', '2026-09-06');
    expect(blokk).toContain(`hreflang="nb" href="${DOMENE}/kalender"`);
    expect(blokk).toContain(`hreflang="en" href="${DOMENE}/en/kalender"`);
    expect(blokk).toContain(`hreflang="x-default" href="${DOMENE}/kalender"`);
  });

  it('setter /en riktig for forsiden', () => {
    // '/en/' med skråstrek til slutt er en annen adresse enn '/en'.
    const blokk = urlBlokk(DOMENE, '/', '2026-09-06');
    expect(blokk).toContain(`<loc>${DOMENE}/</loc>`);
    expect(blokk).toContain(`<loc>${DOMENE}/en</loc>`);
    expect(blokk).not.toContain(`${DOMENE}/en/<`);
  });

  it('rømmer tegn som ville brutt XML-en', () => {
    const ut = byggSitemap({ sports: [{ slug: 'a&b', status: 'aktiv' }], news: [], domene: DOMENE, idag: '2026-09-06' });
    expect(ut).toContain('/idretter/a&amp;b<');
    expect(ut).not.toContain('/idretter/a&b<');
  });

  it('klarer seg uten nyheter og uten grupper', () => {
    const tomt = byggSitemap({ domene: DOMENE, idag: '2026-09-06' });
    expect((tomt.match(/<url>/g) || []).length).toBe(FASTE.length * 2);
  });
});
