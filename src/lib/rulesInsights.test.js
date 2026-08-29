import { describe, it, expect } from 'vitest';
import {
  dietHistogram, ruleProgress, suggestRules,
  ruleTitle, ruleDescription, ruleChip,
} from './rulesInsights.js';

const MEALS = [
  { name: 'Ovnsbakt laks', category: 'Fisk' },
  { name: 'Fiskekaker', category: 'Fisk' },
  { name: 'Taco', category: 'Tex-Mex' },
  { name: 'Lasagne', category: 'Pasta' },
  { name: 'Pannekaker', category: 'Kos' },
];
const TODAY = new Date('2026-08-29T12:00:00');
const d = (daysAgo) => {
  const x = new Date(TODAY); x.setDate(x.getDate() - daysAgo);
  return x.toISOString().slice(0, 10);
};

describe('dietHistogram', () => {
  const history = [
    { name: 'Ovnsbakt laks', date: d(2) }, { name: 'Fiskekaker', date: d(5) },
    { name: 'Ovnsbakt laks', date: d(9) }, { name: 'Taco', date: d(3) },
    { name: 'Taco', date: d(10) }, { name: 'Lasagne', date: d(6) },
    { name: 'Fiskekaker', date: d(40) },     // utenfor vinduet
  ];

  it('teller per kategori innenfor vinduet', () => {
    const h = dietHistogram(history, MEALS, { today: TODAY });
    expect(h.find((x) => x.label === 'Fisk').count).toBe(3);
    expect(h.find((x) => x.label === 'Tex-Mex').count).toBe(2);
  });
  it('utelater det som er eldre enn vinduet', () => {
    const h = dietHistogram(history, MEALS, { today: TODAY, weeks: 4 });
    expect(h.reduce((s, x) => s + x.count, 0)).toBe(6);
  });
  it('sorterer mest spist først', () => {
    expect(dietHistogram(history, MEALS, { today: TODAY })[0].label).toBe('Fisk');
  });
  it('ukjent middag havner i Annet', () => {
    const h = dietHistogram([{ name: 'Mystery', date: d(1) }], MEALS, { today: TODAY });
    expect(h[0].label).toBe('Annet');
  });
});

describe('ruleProgress', () => {
  const rules = [
    { scope: 'Fisk', rule_type: 'min', amount: 2, enabled: true },
    { scope: 'Pasta', rule_type: 'max', amount: 1, enabled: true },
    { scope: 'Taco', rule_type: 'weekday', weekdays: [5], enabled: true },  // ikke kvote
  ];
  const plan = [
    { plan_date: '2026-08-31', meal_name: 'Ovnsbakt laks' },
    { plan_date: '2026-09-01', meal_name: 'Fiskekaker' },
    { plan_date: '2026-09-02', meal_name: 'Lasagne' },
    { plan_date: '2026-09-03', meal_name: 'Lasagne', skipped: true },  // teller ikke
  ];

  it('teller mot kvoten: 2/2 fisk', () => {
    const p = ruleProgress(rules, plan, MEALS);
    const fisk = p.find((x) => x.rule.scope === 'Fisk');
    expect(fisk.value).toBe('2/2');
    expect(fisk.met).toBe(true);
  });
  it('maks-regel innenfor kvoten er ok', () => {
    const pasta = ruleProgress(rules, plan, MEALS).find((x) => x.rule.scope === 'Pasta');
    expect(pasta.value).toBe('1/1');
    expect(pasta.over).toBe(false);
  });
  it('ukedagsregler er ikke kvoter og telles ikke', () => {
    expect(ruleProgress(rules, plan, MEALS)).toHaveLength(2);
  });
  it('hoppede dager teller ikke', () => {
    const pasta = ruleProgress(rules, plan, MEALS).find((x) => x.rule.scope === 'Pasta');
    expect(pasta.count).toBe(1);
  });
});

describe('suggestRules', () => {
  const often = Array.from({ length: 5 }, (_, i) => ({ name: 'Ovnsbakt laks', date: d(i * 5 + 1) }));
  const rare = [{ name: 'Pannekaker', date: d(12) }];

  it('foreslår min-regel for det som spises ofte', () => {
    const s = suggestRules(often, MEALS, [], { today: TODAY });
    const fisk = s.find((x) => x.scope === 'Fisk');
    expect(fisk.rule_type).toBe('min');
    expect(fisk.reason).toMatch(/siste 4 uker/);
  });
  it('foreslår intervallregel for det sporadiske', () => {
    const s = suggestRules(rare, MEALS, [], { today: TODAY });
    const kos = s.find((x) => x.scope === 'Kos');
    expect(kos.rule_type).toBe('interval');
    expect(kos.amount).toBeGreaterThanOrEqual(2);
  });
  it('foreslår ikke det en regel alt dekker', () => {
    const rules = [{ scope: 'Fisk', rule_type: 'min', amount: 2, enabled: true }];
    expect(suggestRules(often, MEALS, rules, { today: TODAY })).toHaveLength(0);
  });
  it('en AVSLÅTT regel dekker ikke — forslaget kommer tilbake', () => {
    const rules = [{ scope: 'Fisk', rule_type: 'min', amount: 2, enabled: false }];
    expect(suggestRules(often, MEALS, rules, { today: TODAY }).length).toBe(1);
  });
  it('foreslår aldri noe for Annet', () => {
    const s = suggestRules([{ name: 'Mystery', date: d(1) }], MEALS, [], { today: TODAY });
    expect(s).toHaveLength(0);
  });
});

describe('visningstekster', () => {
  it('min', () => {
    const r = { scope: 'Fisk', rule_type: 'min', amount: 2 };
    expect(ruleTitle(r)).toBe('Fisk min. 2×/uke');
    expect(ruleChip(r)).toBe('Min. 2/uke');
    expect(ruleDescription(r)).toMatch(/Minst 2/);
  });
  it('max', () => {
    expect(ruleTitle({ scope: 'Pasta', rule_type: 'max', amount: 2 })).toBe('Maks 2 pasta/uke');
  });
  it('interval', () => {
    const r = { scope: 'Pannekaker', rule_type: 'interval', amount: 2 };
    expect(ruleTitle(r)).toBe('Pannekaker ca. hver 2. uke');
    expect(ruleChip(r)).toBe('Hver 2. uke');
  });
  it('weekday med navn', () => {
    expect(ruleTitle({ scope: 'Taco', rule_type: 'weekday', weekdays: [5] })).toBe('Taco på fredag');
  });
});
