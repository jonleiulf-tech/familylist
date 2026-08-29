import { describe, it, expect } from 'vitest';
import {
  assertFetchAllowed, sanitizeForStorage, buildCandidateRow, createJsonLdProvider,
} from './provider.js';
import { getSource } from './sources.js';

const HTML = `<script type="application/ld+json">${JSON.stringify({
  '@type': 'Recipe',
  name: 'Fiskegrateng',
  recipeYield: '4 porsjoner',
  recipeIngredient: ['600 g torsk', '2 dl melk'],
  recipeInstructions: [{ '@type': 'HowToStep', text: 'Hemmelig fremgangsmåte.' }],
  image: 'https://www.tine.no/bilde.jpg',
})}</script>`;

describe('assertFetchAllowed', () => {
  it('slipper gjennom aktiverte kilder', () => {
    expect(() => assertFetchAllowed(getSource('tine'))).not.toThrow();
  });

  it('stopper MatPrat (DISABLED_PENDING_PERMISSION)', () => {
    expect(() => assertFetchAllowed(getSource('matprat'))).toThrow(/ikke aktivert/);
  });
});

describe('sanitizeForStorage', () => {
  it('fjerner fremgangsmåten og legger på lenke-ut-tekst for norske kilder', () => {
    const provider = createJsonLdProvider('tine');
    const clean = provider.parse(HTML, 'https://www.tine.no/oppskrifter/fiskegrateng');
    expect(clean.instructions).toBeNull();
    expect(clean.instructions_link_text).toBe('Se fremgangsmåte hos TINE');
    expect(clean.instructions_url).toContain('tine.no');
    expect(clean.image_copyable).toBe(false);   // bilde-URL ok, kopi ikke
    expect(clean.image_url).toContain('bilde.jpg');
  });
});

describe('buildCandidateRow', () => {
  it('payload er et lett sammendrag uten fulltekst', () => {
    const provider = createJsonLdProvider('tine');
    const row = provider.toCandidate(HTML, 'https://www.tine.no/oppskrifter/fiskegrateng');
    expect(row.source_id).toBe('tine');
    expect(row.title).toBe('Fiskegrateng');
    expect(row.payload.ingredient_count).toBe(2);
    expect(row.payload.servings.base_servings).toBe(4);
    expect(JSON.stringify(row.payload)).not.toContain('Hemmelig');
  });
});
