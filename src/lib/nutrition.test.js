import { describe, it, expect } from 'vitest';
import { gramsOf, mealNutrition, nutritionLabel, relativeToUsual } from './nutrition.js';
import { conceptFor } from './foodConcepts.js';

describe('gramsOf', () => {
  it('vekt oppgitt direkte brukes som den er', () => {
    expect(gramsOf({ qty: 400, unit: 'g' })).toBe(400);
    expect(gramsOf({ qty: 1.2, unit: 'kg' })).toBe(1200);
  });

  it('volum regnes om med tetthet 1', () => {
    expect(gramsOf({ qty: 5, unit: 'dl' })).toBe(500);
    expect(gramsOf({ qty: 2, unit: 'ss' })).toBe(30);
  });

  it('stykker bruker konseptets typiske vekt', () => {
    expect(gramsOf({ qty: 3, unit: 'stk' }, conceptFor('egg'))).toBe(180);
    expect(gramsOf({ qty: 2, unit: 'stk' }, conceptFor('løk'))).toBe(220);
  });

  it('pakkestørrelsen på raden slår konseptets anslag', () => {
    expect(gramsOf({ qty: 2, unit: 'pakke', pack_size: 500 }, conceptFor('kjøttdeig'))).toBe(1000);
  });

  it('upresise mål gir null, ikke en gjetning', () => {
    expect(gramsOf({ qty: 1, unit: 'neve' })).toBeNull();
    expect(gramsOf({ qty: 0, unit: 'g' })).toBeNull();
    expect(gramsOf({ unit: 'g' })).toBeNull();
  });
});

describe('mealNutrition', () => {
  const taco = {
    name: 'Taco',
    ingredients: [
      { n: 'Kjøttdeig', qty: 600, unit: 'g' },
      { n: 'Tortillalefser', qty: 8, unit: 'stk' },
      { n: 'Rømme', qty: 3, unit: 'dl' },
      { n: 'Salt', qty: 1, unit: 'ts' },
    ],
  };

  it('regner kcal per porsjon og teller hvor mye som ble løst', () => {
    const n = mealNutrition(taco, 4);
    // 600 g kjøttdeig (176) + 360 g lefser (300) + 300 g rømme (190)
    expect(n.kcal).toBe(Math.round(0.6 * 176 * 10 + 3.6 * 300 + 3 * 190));
    expect(n.perPortion.kcal).toBe(Math.round(n.kcal / 4));
    expect(n.resolved).toBe(3);
    expect(n.reliable).toBe(true);
  });

  it('porsjoner skalerer tallet, ikke totalen', () => {
    const a = mealNutrition(taco, 2);
    const b = mealNutrition(taco, 4);
    expect(a.kcal).toBe(b.kcal);
    expect(a.perPortion.kcal).toBeCloseTo(b.perPortion.kcal * 2, -1);
  });

  it('krydder teller ikke som et hull i dekningen', () => {
    const n = mealNutrition(taco, 4);
    expect(n.unresolved).not.toContain('Salt');
  });

  it('bommer vi på noe stort, sier vi ingenting', () => {
    // Vekten avgjør, ikke ordene: 500 g av noe ukjent er et hull vi ikke
    // kan regne rundt, uansett hva varen heter.
    const n = mealNutrition({
      name: 'Ukjent gryte',
      ingredients: [{ n: 'Struts', qty: 500, unit: 'g' }, { n: 'Ris', qty: 300, unit: 'g' }],
    }, 4);
    expect(n.unresolved).toContain('Struts');
    expect(n.bearingMissing).toBe(true);
    expect(nutritionLabel(n)).toBeNull();
  });

  it('men et lite garnityr sletter ikke et ellers godt tall', () => {
    // Tidligere slo én bærende «pynt»-rad med upresist mål ut hele
    // beregningen — 3 700 kcal ble kastet for en neve reker.
    const n = mealNutrition({
      name: 'Laksepasta',
      ingredients: [
        { n: 'Laks', qty: 600, unit: 'g' }, { n: 'Pasta', qty: 400, unit: 'g' },
        { n: 'Fløte', qty: 3, unit: 'dl' }, { n: 'Reker', qty: 1, unit: 'neve' },
      ],
    }, 4);
    expect(n.bearingMissing).toBe(false);
    expect(nutritionLabel(n)).not.toBeNull();
  });

  it('en kyllingbuljong dreper ikke kyllingretten', () => {
    // «kyllingbuljong» løses ikke til et konsept, og ordregelen som fantes
    // før flagget alt med «kylling» i navnet som en tapt hovedvare.
    const n = mealNutrition({
      name: 'Kyllingcurry',
      ingredients: [
        { n: 'Kylling', qty: 600, unit: 'g' }, { n: 'Ris', qty: 300, unit: 'g' },
        { n: 'Kyllingbuljong', qty: 2, unit: 'dl' },
      ],
    }, 4);
    expect(n.bearingMissing).toBe(false);
    expect(n.perPortion.kcal).toBeGreaterThan(300);
  });

  it('krydder er ikke med i nevneren — 3 av 3 tellende, ikke 3 av 6', () => {
    const n = mealNutrition({
      name: 'Laks og potet',
      ingredients: [
        { n: 'Laks', qty: 600, unit: 'g' }, { n: 'Potet', qty: 800, unit: 'g' },
        { n: 'Brokkoli', qty: 400, unit: 'g' },
        { n: 'Salt' }, { n: 'Pepper' }, { n: 'Vann', qty: 2, unit: 'dl' },
      ],
    }, 4);
    expect(n.total).toBe(3);
    expect(n.reliable).toBe(true);
  });

  it('«1 pakke spaghetti» er en halvkilo, ikke en neve', () => {
    expect(gramsOf({ qty: 1, unit: 'pakke' }, conceptFor('spaghetti'))).toBe(500);
    expect(gramsOf({ qty: 1, unit: 'boks' }, conceptFor('knuste tomater'))).toBe(400);
    expect(gramsOf({ qty: 2, unit: 'pakke' }, conceptFor('kjøttdeig'))).toBe(800);
  });

  it('uendelig porsjonstall gir ikke «ca. 0 kcal»', () => {
    const n = mealNutrition({ name: 'X', ingredients: [{ n: 'Laks', qty: 400, unit: 'g' }] }, Infinity);
    expect(n.perPortion.kcal).toBeGreaterThan(0);
  });

  it('middag uten noe gjenkjennelig gir null', () => {
    expect(mealNutrition({ name: 'Rester', ingredients: [] })).toBeNull();
    expect(mealNutrition({ name: 'X', ingredients: [{ n: 'Blåbærsaft med fnugg' }] })).toBeNull();
  });

  it('kokebokoppskrifter uten mengder gir ingen påstand', () => {
    const n = mealNutrition({ name: 'Wok', raw_ingredients: ['kylling', 'paprika'] }, 4);
    expect(n).toBeNull();
  });
});

describe('nutritionLabel — dekningen følger alltid tallet', () => {
  it('sier hvor mange varer tallet bygger på', () => {
    const n = mealNutrition({
      name: 'Laks',
      ingredients: [{ n: 'Laks', qty: 600, unit: 'g' }, { n: 'Potet', qty: 800, unit: 'g' }],
    }, 4);
    const l = nutritionLabel(n);
    expect(l.main).toMatch(/^ca\. [\d\s ]+ kcal$/);
    expect(l.sub).toContain('beregnet fra 2 av 2 ingredienser');
  });
});

describe('relativeToUsual — målt mot deres egne middager', () => {
  const usual = [400, 500, 600, 700, 800, 900];

  it('plasserer retten i deres eget spenn', () => {
    expect(relativeToUsual(420, usual)).toBe('lettere');
    expect(relativeToUsual(650, usual)).toBe('som vanlig');
    expect(relativeToUsual(950, usual)).toBe('tyngre');
  });

  it('for lite historikk gir ingen dom', () => {
    expect(relativeToUsual(500, [400, 600])).toBeNull();
    expect(relativeToUsual(0, usual)).toBeNull();
    expect(relativeToUsual(500, [])).toBeNull();
  });
});
