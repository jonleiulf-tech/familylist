import { describe, it, expect } from 'vitest';
import { extractWebOffers } from './webOffers.js';

describe('extractWebOffers — JSON-LD Product', () => {
  const html = `<html><head>
    <script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ItemList',
        itemListElement: [
          { '@type': 'ListItem', item: { '@type': 'Product', name: 'Norvegia 1 kg', brand: { name: 'Tine' }, offers: { '@type': 'Offer', price: '89.90' } } },
          { '@type': 'ListItem', item: { '@type': 'Product', name: 'Kjøttdeig 400 g', offers: { price: 39.9 } } },
        ],
      },
    ],
  })}</script></head><body/></html>`;

  it('finner produkter med pris i @graph/ItemList', () => {
    const rows = extractWebOffers(html);
    expect(rows.map((r) => r.product_name)).toEqual(['Norvegia 1 kg', 'Kjøttdeig 400 g']);
    expect(rows[0].price).toBe(89.9);
    expect(rows[0].brand).toBe('Tine');
  });
});

describe('extractWebOffers — JSON-blober (Next.js-stil)', () => {
  const blob = {
    props: {
      pageProps: {
        offers: [
          { title: 'Grillpølser 600 g', currentPrice: 29.9, ordinaryPrice: 45.5 },
          { title: 'Jarlsberg 700 g', currentPrice: '99,00', ordinaryPrice: '129,00' },
          { title: 'Handlekurv', currentPrice: 0 },              // usann pris → ut
          { title: 'x', currentPrice: 25 },                       // for kort navn → ut
        ],
      },
    },
  };
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(blob)}</script>`;

  it('finner produkter dypt i JSON, med norsk desimalkomma og førpris', () => {
    const rows = extractWebOffers(html);
    expect(rows.map((r) => r.product_name)).toEqual(['Grillpølser 600 g', 'Jarlsberg 700 g']);
    expect(rows[0]).toMatchObject({ price: 29.9, original_price: 45.5 });
    expect(rows[1]).toMatchObject({ price: 99, original_price: 129 });
  });

  it('takler «window.__STATE__ = {...};»-form', () => {
    const js = `window.__STATE__ = ${JSON.stringify(blob)};`;
    const rows = extractWebOffers(`<script>${js}</script>`);
    expect(rows).toHaveLength(2);
  });

  it('førpris lik/lavere enn pris forkastes som støy', () => {
    const rows = extractWebOffers(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      a: [{ name: 'Melk 1 l', price: 25, originalPrice: 25 }],
    })}</script>`);
    expect(rows[0].original_price).toBeNull();
  });

  it('duplikater dedupliseres — laveste pris vinner', () => {
    const rows = extractWebOffers(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      a: [{ name: 'Brød', price: 32 }, { name: 'brød', price: 29 }],
    })}</script>`);
    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe(29);
  });

  it('tom side gir tom liste, aldri unntak', () => {
    expect(extractWebOffers('')).toEqual([]);
    expect(extractWebOffers('<html><body>Laster …</body></html>')).toEqual([]);
  });
});
