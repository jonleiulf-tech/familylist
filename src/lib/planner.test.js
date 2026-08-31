import { describe, it, expect } from 'vitest';
import { generatePlan, mealMatchesScope } from './planner.js';

const MEALS = [
  { name: 'Taco', category: 'Tex-Mex', ingredients: [{ n: 'Kjøttdeig' }, { n: 'Tacolefser' }] },
  { name: 'Ovnsbakt laks', category: 'Fisk', ingredients: [{ n: 'Laksefilet' }] },
  { name: 'Fiskekaker', category: 'Fisk', ingredients: [{ n: 'Fiskekaker' }] },
  { name: 'Fiskepinner', category: 'Fisk', ingredients: [{ n: 'Fiskepinner' }] },
  { name: 'Spagetti med kjøttsaus', category: 'Pasta', ingredients: [{ n: 'Spagetti' }] },
  { name: 'Lasagne', category: 'Pasta', ingredients: [{ n: 'Lasagneplater' }] },
  { name: 'Kylling curry', category: 'Kylling', ingredients: [{ n: 'Kyllingfilet' }] },
  { name: 'Pannekaker', category: 'Kos', ingredients: [{ n: 'Egg' }] },
];

// 2026-08-31 er en mandag, så uka går mandag..søndag.
const WEEK = [
  '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03',
  '2026-09-04', '2026-09-05', '2026-09-06',
];
const emptyWeek = () => WEEK.map((plan_date) => ({ plan_date }));

// Forutsigbar «tilfeldighet» slik at testene ikke flakker.
const fixedRandom = () => 0;

describe('mealMatchesScope', () => {
  it('matcher på kategori', () => {
    expect(mealMatchesScope(MEALS[1], 'Fisk')).toBe(true);
  });
  it('matcher på navn', () => {
    expect(mealMatchesScope(MEALS[0], 'taco')).toBe(true);
  });
  it('matcher på ingrediens', () => {
    expect(mealMatchesScope(MEALS[0], 'kjøttdeig')).toBe(true);
  });
  it('matcher ikke noe annet', () => {
    expect(mealMatchesScope(MEALS[1], 'Pasta')).toBe(false);
  });
});

describe('generatePlan', () => {
  it('fyller alle tomme dager', () => {
    const out = generatePlan({ plan: emptyWeek(), meals: MEALS, random: fixedRandom });
    expect(out).toHaveLength(7);
    expect(out.every((d) => d.meal_name)).toBe(true);
  });

  it('rører ikke låste dager', () => {
    const plan = emptyWeek();
    plan[2] = { plan_date: WEEK[2], meal_name: 'Lasagne', locked: true };
    const out = generatePlan({ plan, meals: MEALS, random: fixedRandom });
    expect(out.map((d) => d.plan_date)).not.toContain(WEEK[2]);
    expect(out).toHaveLength(6);
  });

  it('rører ikke dager som er spist eller hoppet over', () => {
    const plan = emptyWeek();
    plan[0] = { plan_date: WEEK[0], meal_name: 'Taco', done: true };
    plan[1] = { plan_date: WEEK[1], skipped: true };
    const out = generatePlan({ plan, meals: MEALS, random: fixedRandom });
    const dates = out.map((d) => d.plan_date);
    expect(dates).not.toContain(WEEK[0]);
    expect(dates).not.toContain(WEEK[1]);
  });

  it('legger taco på fredag når regelen sier det', () => {
    const rules = [{ scope: 'Taco', rule_type: 'weekday', weekdays: [5], enabled: true }];
    const out = generatePlan({ plan: emptyWeek(), meals: MEALS, rules, random: fixedRandom });
    const friday = out.find((d) => d.plan_date === '2026-09-04');   // fredag
    expect(friday.meal_name).toBe('Taco');
    expect(friday.reason).toMatch(/Regel/);
  });

  it('oppfyller minimumsregel om to fiskemiddager', () => {
    const rules = [{ scope: 'Fisk', rule_type: 'min', amount: 2, enabled: true }];
    const out = generatePlan({ plan: emptyWeek(), meals: MEALS, rules, random: fixedRandom });
    const fishCount = out.filter((d) =>
      MEALS.find((m) => m.name === d.meal_name)?.category === 'Fisk').length;
    expect(fishCount).toBeGreaterThanOrEqual(2);
  });

  it('teller fisk som alt står i planen mot kvoten', () => {
    const plan = emptyWeek();
    plan[0] = { plan_date: WEEK[0], meal_name: 'Ovnsbakt laks', locked: true };
    plan[1] = { plan_date: WEEK[1], meal_name: 'Fiskekaker', locked: true };
    const rules = [{ scope: 'Fisk', rule_type: 'min', amount: 2, enabled: true }];
    const out = generatePlan({ plan, meals: MEALS, rules, random: fixedRandom });
    // Kvoten er alt oppfylt, så ingen av forslagene skal begrunnes med fiskeregelen.
    expect(out.every((d) => !/minst 2 fisk/.test(d.reason))).toBe(true);
  });

  it('respekterer maksregel', () => {
    const rules = [{ scope: 'Pasta', rule_type: 'max', amount: 1, enabled: true }];
    const out = generatePlan({ plan: emptyWeek(), meals: MEALS, rules, random: fixedRandom });
    const pastaCount = out.filter((d) =>
      MEALS.find((m) => m.name === d.meal_name)?.category === 'Pasta').length;
    expect(pastaCount).toBeLessThanOrEqual(1);
  });

  it('ignorerer avslåtte regler', () => {
    const rules = [{ scope: 'Taco', rule_type: 'weekday', weekdays: [5], enabled: false }];
    const out = generatePlan({ plan: emptyWeek(), meals: MEALS, rules, random: fixedRandom });
    expect(out.every((d) => !/Regel/.test(d.reason))).toBe(true);
  });

  it('gjentar ikke samme middag innenfor planen', () => {
    const out = generatePlan({ plan: emptyWeek(), meals: MEALS, random: fixedRandom });
    const names = out.map((d) => d.meal_name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('unngår det som nettopp ble spist', () => {
    // Pannekaker sist, Taco nest sist -> begge skal nedprioriteres.
    const history = ['Pannekaker', 'Taco'];
    const plan = [{ plan_date: WEEK[0] }];
    const out = generatePlan({ plan, meals: MEALS, history, random: fixedRandom });
    expect(out[0].meal_name).not.toBe('Pannekaker');
  });

  it('takler færre middager enn dager uten å krasje', () => {
    const few = MEALS.slice(0, 2);
    const out = generatePlan({ plan: emptyWeek(), meals: few, random: fixedRandom });
    expect(out.length).toBe(7);
    expect(out.some((d) => /Gjentak/.test(d.reason))).toBe(true);
  });

  it('returnerer tomt når det ikke finnes middager', () => {
    expect(generatePlan({ plan: emptyWeek(), meals: [], random: fixedRandom })).toEqual([]);
  });

  it('returnerer tomt når alle dager er opptatt', () => {
    const plan = WEEK.map((plan_date) => ({ plan_date, meal_name: 'Taco' }));
    expect(generatePlan({ plan, meals: MEALS, random: fixedRandom })).toEqual([]);
  });

  it('kombinerer ukedagsregel og minimumsregel samtidig', () => {
    const rules = [
      { scope: 'Taco', rule_type: 'weekday', weekdays: [5], enabled: true },
      { scope: 'Fisk', rule_type: 'min', amount: 2, enabled: true },
    ];
    const out = generatePlan({ plan: emptyWeek(), meals: MEALS, rules, random: fixedRandom });
    expect(out.find((d) => d.plan_date === '2026-09-04').meal_name).toBe('Taco');
    const fish = out.filter((d) =>
      MEALS.find((m) => m.name === d.meal_name)?.category === 'Fisk').length;
    expect(fish).toBeGreaterThanOrEqual(2);
  });
});

describe('intervallregler', () => {
  const rules = [{ scope: 'Kos', rule_type: 'interval', amount: 2, enabled: true }];
  const week = () => WEEK.map((plan_date) => ({ plan_date }));

  it('planlegger middagen når det er lenge nok siden sist', () => {
    const history = [{ name: 'Pannekaker', date: '2026-08-10' }];   // 21 dager før uka
    const out = generatePlan({ plan: week(), meals: MEALS, rules, history, random: fixedRandom });
    const hit = out.find((d) => d.meal_name === 'Pannekaker');
    expect(hit).toBeDefined();
    expect(hit.reason).toMatch(/hver 2\. uke/);
  });

  it('venter når middagen nettopp er servert', () => {
    const history = [{ name: 'Pannekaker', date: '2026-08-27' }];   // 4 dager før uka
    const out = generatePlan({ plan: week(), meals: MEALS, rules, history, random: fixedRandom });
    expect(out.find((d) => /hver 2\. uke/.test(d.reason))).toBeUndefined();
  });

  it('planlegger når middagen aldri er servert', () => {
    const out = generatePlan({ plan: week(), meals: MEALS, rules, history: [], random: fixedRandom });
    expect(out.some((d) => /ikke servert på lenge/.test(d.reason))).toBe(true);
  });

  it('dobler ikke når planen alt dekker regelen', () => {
    const plan = week();
    plan[0] = { plan_date: WEEK[0], meal_name: 'Pannekaker', locked: true };
    const out = generatePlan({ plan, meals: MEALS, rules, history: [], random: fixedRandom });
    expect(out.filter((d) => d.meal_name === 'Pannekaker')).toHaveLength(0);
  });

  it('tåler gammel historikk som rene navn', () => {
    const out = generatePlan({ plan: week(), meals: MEALS, rules, history: ['Taco'], random: fixedRandom });
    expect(out.length).toBe(7);
  });
});

describe('genereringsmoduser', () => {
  const meals = [
    { name: 'Taco', ingredients: [{ n: 'Kjøttdeig', qty: 600, unit: 'g' }] },
    { name: 'Laks i ovn', ingredients: [{ n: 'Laks', qty: 600, unit: 'g' }] },
    { name: 'Salat med kylling', ingredients: [{ n: 'Kylling', qty: 400, unit: 'g' }, { n: 'Salat', qty: 200, unit: 'g' }] },
  ];
  const plan = [{ plan_date: '2026-09-01' }, { plan_date: '2026-09-02' }];
  const base = { plan, meals, rules: [], history: [], random: () => 0, today: '2026-09-01' };

  it('«billigst» setter retten med tilbud først', () => {
    const offers = [{
      id: 'o1', product_name: 'Fersk laksefilet 400 g', price: 79, original_price: 129,
      store_code: 'rema', store_name: 'REMA 1000',
    }];
    const out = generatePlan({ ...base, mode: 'billigst', offers });
    expect(out[0].meal_name).toBe('Laks i ovn');
    expect(out[0].reason).toContain('Tilbud nå');
  });

  it('«lettere» setter retten med færrest kalorier først', () => {
    const out = generatePlan({ ...base, mode: 'lettere', servings: 4 });
    expect(out[0].meal_name).toBe('Salat med kylling');
    expect(out[0].reason).toContain('kcal per porsjon');
  });

  it('modus overstyrer aldri en ukedagsregel', () => {
    const rules = [{ scope: 'Taco', rule_type: 'weekday', weekdays: [2], enabled: true }];
    // 2026-09-01 er en tirsdag.
    const out = generatePlan({ ...base, rules, mode: 'lettere' });
    expect(out.find((d) => d.plan_date === '2026-09-01').meal_name).toBe('Taco');
  });

  it('uten tilbud faller «billigst» tilbake på variasjon', () => {
    const out = generatePlan({ ...base, mode: 'billigst', offers: [] });
    expect(out).toHaveLength(2);
    expect(out[0].reason).toBe('Variasjon fra middagene deres');
  });
});
