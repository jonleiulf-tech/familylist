import { describe, it, expect } from 'vitest';
import { mapMealDbMeal, searchMealDb, candidateToMeal } from './inspiration.js';

const MEALDB_SPAG = {
  idMeal: '52770',
  strMeal: 'Spaghetti Bolognese',
  strCategory: 'Beef',
  strArea: 'Italian',
  strMealThumb: 'https://www.themealdb.com/images/media/meals/sutysw1468247559.jpg',
  strSource: 'https://example.com/bolognese',
  strIngredient1: 'ground beef', strMeasure1: '600 g',
  strIngredient2: 'onion', strMeasure2: '1',
  strIngredient3: 'garlic', strMeasure3: '2 cloves',
  strIngredient4: 'chopped tomatoes', strMeasure4: '1 can',
  strIngredient5: '', strMeasure5: '',
};

const CATALOG = [
  { name: 'Kjøttdeig', major_category: 'Kjøtt', avg_price: 62, score: 30 },
  { name: 'Løk', major_category: 'Grønnsaker', avg_price: 5, score: 25 },
  { name: 'Hvitløk', major_category: 'Grønnsaker', avg_price: 12, score: 12 },
  { name: 'Hakkede tomater', major_category: 'Hermetikk', avg_price: 14, score: 18 },
];

describe('mapMealDbMeal', () => {
  it('oversetter kategori og samler mål + ingrediens', () => {
    const r = mapMealDbMeal(MEALDB_SPAG);
    expect(r.name).toBe('Spaghetti Bolognese');
    expect(r.category).toBe('Kjøtt');
    expect(r.raw_ingredients).toEqual(['600 g ground beef', '1 onion', '2 cloves garlic', '1 can chopped tomatoes']);
    expect(r.servings).toBeNull();                       // aldri antatt
    expect(r.instructions_url).toBe('https://example.com/bolognese');
  });

  it('uten strSource lenkes det til TheMealDB-siden', () => {
    const { strSource, ...rest } = MEALDB_SPAG;
    expect(mapMealDbMeal(rest).instructions_url).toContain('themealdb.com/meal/52770');
  });
});

describe('searchMealDb', () => {
  it('mapper API-svar', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ meals: [MEALDB_SPAG] }) });
    const { results, error } = await searchMealDb('bolognese', { fetchImpl });
    expect(error).toBeNull();
    expect(results).toHaveLength(1);
  });

  it('nettverksfeil gir melding, ikke unntak', async () => {
    const fetchImpl = async () => { throw new Error('offline'); };
    const { results, error } = await searchMealDb('x', { fetchImpl });
    expect(results).toEqual([]);
    expect(error).toMatch(/nettverk/i);
  });
});

describe('candidateToMeal', () => {
  it('kobler mot VÅR varedatabase og merker umatchede', () => {
    const cand = mapMealDbMeal(MEALDB_SPAG);
    const { meal, rows, unmatched, servingsKnown } = candidateToMeal(cand, CATALOG, new Map());
    expect(meal.ingredients.map((i) => i.n)).toEqual(['Kjøttdeig', 'Løk', 'Hvitløk', 'Hakkede tomater']);
    expect(rows.every((r) => r.matched)).toBe(true);
    expect(unmatched).toEqual([]);
    expect(servingsKnown).toBe(false);                   // MealDB oppgir ikke porsjoner
  });
});
