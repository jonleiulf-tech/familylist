import { describe, it, expect } from 'vitest';
import { FORMATER, finnFormat, passeInn, skala, trykkBilde, dpi } from './materiell.js';

describe('formatene', () => {
  it('følger malen fra hustrykkeriet', () => {
    const r = finnFormat('rollup85');
    expect(r.bredde).toBe(850);
    expect(r.høyde).toBe(2050);
  });

  it('holder av plass nederst til kassetten', () => {
    for (const f of FORMATER.filter((x) => x.id.startsWith('rollup'))) {
      expect(f.trygg.bunn).toBeGreaterThanOrEqual(50);
    }
  });

  it('regner om pikselformater til millimeter', () => {
    const ig = finnFormat('ig-post');
    expect(ig.bredde).toBeCloseTo(285.75, 1);
    expect(ig.bredde).toBeCloseTo(ig.høyde, 1);
  });

  it('gir første format når id-en er ukjent', () => {
    expect(finnFormat('finnes-ikke').id).toBe('rollup85');
  });
});

describe('forhåndsvisningen', () => {
  it('krymper til det trangeste målet', () => {
    const r = finnFormat('rollup85');
    expect(passeInn(r, 850, 4100)).toBeCloseTo(1, 5);
    expect(passeInn(r, 425, 4100)).toBeCloseTo(0.5, 5);
    expect(passeInn(r, 850, 1025)).toBeCloseTo(0.5, 5);
  });

  it('forstørrer aldri', () => {
    expect(passeInn(finnFormat('rollup85'), 5000, 5000)).toBe(1);
  });
});

describe('bildekvalitet', () => {
  it('bruker originalen, ikke nettversjonen', () => {
    expect(trykkBilde({ url: 'orig.jpg', web_url: 'web.webp' })).toBe('orig.jpg');
  });

  it('faller tilbake til nettversjonen når originalen mangler', () => {
    expect(trykkBilde({ web_url: 'web.webp' })).toBe('web.webp');
  });

  it('advarer om for lite bilde til storformat', () => {
    const r = finnFormat('rollup85');
    expect(dpi({ width: 4000 }, r)).toBe(120);   // greit
    expect(dpi({ width: 1600 }, r)).toBe(48);    // for lite
  });
});

describe('skalering av skrift', () => {
  it('er 1 på rollup 85 og mindre på et lite format', () => {
    expect(skala(finnFormat('rollup85'))).toBe(1);
    expect(skala(finnFormat('ig-post'))).toBeLessThan(0.5);
  });
});
