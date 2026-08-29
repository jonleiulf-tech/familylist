import { describe, it, expect } from 'vitest';
import { rank, rankProducts } from './kassalRank.js';

// Nøyaktig de treffene søket på «melk» ga i appen, pluss ekte melk
// som skulle vært øverst. Dette er regresjonstesten for feilen.
const MELK_HITS = [
  { name: 'Kondensmelk 397g Steinhauer', current_price: 44.9 },
  { name: 'Mandelmelk Naturell 1l Ecomil', current_price: 52.9 },
  { name: 'Mandelmelk m/Vanilje 1l Ecomil', current_price: 59.9 },
  { name: 'Helmelk Økologisk, 1 l', current_price: 59.9 },
  { name: 'Kokosmelk Lett 250ml Eldorado', current_price: 10.9 },
  { name: 'Lettmelk 1,2% 1l', current_price: 24.9 },
  { name: 'Tine Melk Helmelk 1l', current_price: 26.4 },
  { name: 'Melkesjokolade 200g', current_price: 39.9 },
];

describe('rank — sammensetninger', () => {
  it('rangerer kvalifikator-sammensetning høyt', () => {
    expect(rank('melk', 'Lettmelk 1,2% 1l')).toBeGreaterThan(70);
  });

  it('rangerer egen-råvare-sammensetning lavt', () => {
    expect(rank('melk', 'Kondensmelk 397g')).toBeLessThan(60);
    expect(rank('melk', 'Mandelmelk Naturell 1l')).toBeLessThan(60);
    expect(rank('melk', 'Kokosmelk Lett 250ml')).toBeLessThan(60);
  });

  it('setter ekte melk over kondensmelk', () => {
    expect(rank('melk', 'Lettmelk 1,2% 1l'))
      .toBeGreaterThan(rank('melk', 'Kondensmelk 397g Steinhauer'));
  });

  it('setter «Melk» som eget ord over sammensetning med annen råvare', () => {
    expect(rank('melk', 'Tine Melk 1l'))
      .toBeGreaterThan(rank('melk', 'Mandelmelk Naturell 1l Ecomil'));
  });

  it('nedprioriterer melkesjokolade', () => {
    expect(rank('melk', 'Melkesjokolade 200g'))
      .toBeLessThan(rank('melk', 'Lettmelk 1,2% 1l'));
  });

  it('gir eksakt treff toppscore', () => {
    expect(rank('melk', 'melk')).toBe(100);
  });
});

describe('rank — prisnærhet', () => {
  it('løfter produkt nær familiens snittpris', () => {
    const near = rank('melk', 'Lettmelk 1l', { price: 25, expectedPrice: 25 });
    const bare = rank('melk', 'Lettmelk 1l');
    expect(near).toBeGreaterThan(bare);
  });

  it('straffer produkt langt over snittprisen', () => {
    const far = rank('melk', 'Lettmelk 1l', { price: 200, expectedPrice: 25 });
    const bare = rank('melk', 'Lettmelk 1l');
    expect(far).toBeLessThan(bare);
  });

  it('ignorerer pris når snittpris mangler', () => {
    expect(rank('melk', 'Lettmelk 1l', { price: 25 })).toBe(rank('melk', 'Lettmelk 1l'));
  });
});

describe('rankProducts — mot de faktiske treffene', () => {
  it('setter vanlig melk øverst', () => {
    const out = rankProducts('melk', MELK_HITS, { expectedPrice: 25 });
    expect(out[0].name).toMatch(/Lettmelk|Tine Melk/);
  });

  it('presser kondensmelk og mandelmelk ned fra topp tre', () => {
    const top3 = rankProducts('melk', MELK_HITS, { expectedPrice: 25 })
      .slice(0, 3).map((p) => p.name);
    expect(top3.join(' ')).not.toMatch(/Kondensmelk|Mandelmelk|Kokosmelk/);
  });

  it('holder melkesjokolade utenfor topp tre', () => {
    const top3 = rankProducts('melk', MELK_HITS, { expectedPrice: 25 })
      .slice(0, 3).map((p) => p.name);
    expect(top3.join(' ')).not.toMatch(/Melkesjokolade/);
  });

  it('respekterer size', () => {
    expect(rankProducts('melk', MELK_HITS, { size: 3 })).toHaveLength(3);
  });

  it('returnerer tomt for tomt søk', () => {
    expect(rankProducts('', MELK_HITS)).toEqual([]);
  });
});

describe('rank — andre varer', () => {
  it('gulost: Norvegia som eget ord slår delstreng', () => {
    expect(rank('norvegia', 'Norvegia Original 1kg')).toBeGreaterThan(80);
  });
  it('kjøttdeig treffer eksakt ord', () => {
    expect(rank('kjøttdeig', 'Kjøttdeig 14% 400g Gilde')).toBeGreaterThan(80);
  });
  it('brød: grovbrød er brød', () => {
    expect(rank('brød', 'Grovbrød 750g')).toBeGreaterThan(30);
  });
});
