import { describe, it, expect } from 'vitest';
import { byggSportsRader, byggContentRader } from './importer.js';
import { fileContent } from '../lib/content.jsx';

describe('byggSportsRader', () => {
  it('gir hver gruppe en rekkefølge selv når datafila mangler sort_order', () => {
    const rader = byggSportsRader(fileContent().sports);
    expect(rader).toHaveLength(5);
    for (const r of rader) {
      expect(Number.isFinite(r.sort_order)).toBe(true);
      expect(r.sort_order).toBeGreaterThan(0);
    }
    // Rekkefølgen i fila er den vi vil ha på siden.
    expect(rader.map((r) => r.slug)).toEqual(['fotball', 'volleyball', 'klatring', 'padel', 'sigrun']);
    expect(rader.map((r) => r.sort_order)).toEqual([10, 20, 30, 40, 50]);
  });

  it('beholder en sort_order som allerede er satt', () => {
    const rader = byggSportsRader([{ slug: 'a', sort_order: 5 }, { slug: 'b' }]);
    expect(rader[0].sort_order).toBe(5);
    expect(rader[1].sort_order).toBe(20);
  });

  it('flytter alt annet enn slug, active og sort_order inn i data', () => {
    const [r] = byggSportsRader([{ slug: 'a', active: false, name: 'PSI A', spondCode: 'XX' }]);
    expect(r.active).toBe(false);
    expect(r.data).toEqual({ name: 'PSI A', spondCode: 'XX' });
    expect(r.data.slug).toBeUndefined();
  });

  it('regner manglende active som aktiv', () => {
    expect(byggSportsRader([{ slug: 'a' }])[0].active).toBe(true);
  });
});

describe('byggContentRader', () => {
  it('lager én rad per nøkkel, og hopper over det som mangler', () => {
    const rader = byggContentRader(fileContent());
    expect(rader.map((r) => r.key)).toEqual(['site', 'organization', 'stats', 'partners']);
    expect(rader.every((r) => r.value != null)).toBe(true);
    expect(byggContentRader({ site: { a: 1 } })).toHaveLength(1);
  });
});
