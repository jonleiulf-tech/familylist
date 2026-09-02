import { describe, it, expect } from 'vitest';
import {
  looksLikeDetailPage, findRecipeLinks, firstDetailUrlFromFeed, parseRobots, robotsAllows,
} from './audit-recipe-sources.mjs';

describe('looksLikeDetailPage — én oppskrift, ikke en oversikt', () => {
  it('kjenner igjen oversiktssider', () => {
    // Revisjonen 2. september dømte fire kilder «uten JSON-LD» fordi den
    // hadde plukket nettopp slike sider som «detaljside».
    expect(looksLikeDetailPage('https://oda.com/no/recipes/')).toBe(false);
    expect(looksLikeDetailPage('https://www.gilde.no/oppskrifter')).toBe(false);
    expect(looksLikeDetailPage('https://trinesmatblogg.no/oppskrifter/')).toBe(false);
    expect(looksLikeDetailPage('https://kiwi.no/oppskrifter')).toBe(false);
    expect(looksLikeDetailPage('https://www.coop.no/inspirasjon/middag')).toBe(false);
    expect(looksLikeDetailPage('https://detgladekjokken.no/middagstips/')).toBe(false);
  });

  it('kjenner igjen enkeltoppskrifter', () => {
    expect(looksLikeDetailPage('https://www.tine.no/oppskrifter/middag-og-hovedretter/pannekaker/grunnoppskrift-pannekaker')).toBe(true);
    expect(looksLikeDetailPage('https://detgladekjokken.no/oppskrift/blomkalsuppe/')).toBe(true);
    expect(looksLikeDetailPage('https://idamariesmat.no/oppskrift/kyllingsuppe-med-urter-og-pasta/')).toBe(true);
    expect(looksLikeDetailPage('https://www.frukt.no/oppskrifter/lys-lapskaus/')).toBe(true);
  });

  it('tåler søppel', () => {
    expect(looksLikeDetailPage('ikke en url')).toBe(false);
    expect(looksLikeDetailPage('https://oda.com/')).toBe(false);
  });
});

describe('findRecipeLinks — enkeltoppskrifter først', () => {
  it('sorterer oversiktssider bakerst', () => {
    const html = `
      <a href="/oppskrifter">Alle oppskrifter</a>
      <a href="/oppskrifter/blomkalsuppe">Blomkålsuppe</a>
      <a href="/om-oss">Om oss</a>
    `;
    const links = findRecipeLinks(html, 'https://example.no/oppskrifter');
    expect(links[0]).toBe('https://example.no/oppskrifter/blomkalsuppe');
    expect(links).toContain('https://example.no/oppskrifter');
    expect(links).not.toContain('https://example.no/om-oss');
  });
});

describe('firstDetailUrlFromFeed', () => {
  const rss = `<?xml version="1.0"?><rss><channel>
    <link>https://blogg.no/oppskrifter/</link>
    <item><link>https://blogg.no/oppskrift/kjottkaker-i-brun-saus/</link></item>
    <item><link>https://blogg.no/oppskrift/blomkalsuppe/</link></item>
  </channel></rss>`;

  it('plukker første enkeltoppskrift fra en RSS-feed', () => {
    expect(firstDetailUrlFromFeed(rss, 'https://blogg.no/feed/'))
      .toBe('https://blogg.no/oppskrift/kjottkaker-i-brun-saus/');
  });

  it('hopper over sitemap-indekser og oversiktssider', () => {
    const sitemap = `<urlset>
      <url><loc>https://blogg.no/sitemap-1.xml</loc></url>
      <url><loc>https://blogg.no/oppskrifter/</loc></url>
      <url><loc>https://blogg.no/oppskrift/lapskaus/</loc></url>
    </urlset>`;
    expect(firstDetailUrlFromFeed(sitemap, 'https://blogg.no/sitemap.xml'))
      .toBe('https://blogg.no/oppskrift/lapskaus/');
  });

  it('respekterer robots-filteret det får inn', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /oppskrift/');
    const allowed = (u) => robotsAllows(rules, new URL(u).pathname);
    expect(firstDetailUrlFromFeed(rss, 'https://blogg.no/feed/', allowed)).toBe(null);
  });

  it('gir null når feeden er tom', () => {
    expect(firstDetailUrlFromFeed('<rss></rss>', 'https://blogg.no/feed/')).toBe(null);
  });
});
