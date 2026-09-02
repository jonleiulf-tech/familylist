// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { Meals } from './Meals.jsx';

// Fem tomme dager fra en fast mandag, så forslagene er forutsigbare.
const days = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'];
const plan = days.map((plan_date) => ({
  plan_date, meal_name: null, meal_id: null, skipped: false,
  locked: false, done: false, guest_portions: 0, sent_to_list_at: null, reason: null,
}));

const meals = [
  { id: 'm1', name: 'Taco', category: 'Kjøtt', ingredients: [{ n: 'Kjøttdeig', qty: 1 }], saved: true },
  { id: 'm2', name: 'Fiskegrateng', category: 'Fisk', ingredients: [{ n: 'Fisk', qty: 1 }], saved: true },
  { id: 'm3', name: 'Pannekaker', category: 'Vegetar', ingredients: [{ n: 'Melk', qty: 1 }], saved: true },
  { id: 'm4', name: 'Kjøttkaker', category: 'Kjøtt', ingredients: [{ n: 'Kjøttkaker', qty: 1 }], saved: true },
  { id: 'm5', name: 'Laksefilet', category: 'Fisk', ingredients: [{ n: 'Laks', qty: 1 }], saved: true },
  { id: 'm6', name: 'Pizza', category: 'Annet', ingredients: [{ n: 'Pizza', qty: 1 }], saved: true },
];

function setup(extra = {}) {
  const onApplyGenerated = vi.fn().mockResolvedValue(undefined);
  const toast = vi.fn();
  const props = {
    plan, meals, mealLibrary: [], catalog: [], normRules: new Map(), defaultStore: 'REMA 1000',
    rules: [], history: [], existingNames: new Set(), household: { adults: 2, children: 2 },
    onSetMeal: vi.fn(), onMoveMeal: vi.fn(), onSkipDay: vi.fn(), onClearDay: vi.fn(),
    onAddDays: vi.fn(), onToggleLock: vi.fn(), onSaveMeal: vi.fn(), onDeleteMeal: vi.fn(),
    onSetGuests: vi.fn(), onSavePortions: vi.fn(), onSendToList: vi.fn(), onApplyGenerated,
    onMarkSent: vi.fn(), onUnmarkSent: vi.fn(), onGoShopping: vi.fn(),
    hiddenMeals: [], onHideMeal: vi.fn(), onUnhideMeal: vi.fn(), inspireSignal: 0,
    weekTemplates: [], onRemoveLastDay: vi.fn(), onSaveWeekTemplate: vi.fn(),
    onApplyWeekTemplate: vi.fn(), onDeleteWeekTemplate: vi.fn(),
    rulesPanel: null, offers: [], toast,
    ...extra,
  };
  render(<Meals {...props} />);
  return { onApplyGenerated, toast };
}

const click = (el) => act(() => { fireEvent.click(el); });

describe('Middag: forslag til planen', () => {
  beforeEach(() => { vi.spyOn(console, 'error'); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('viser dialogen med én rad per foreslått dag, alle avhuket', () => {
    setup();
    click(screen.getByRole('button', { name: /Foreslå ny ukemeny/ }));
    expect(screen.getByText('Forslag til planen')).toBeTruthy();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.length).toBe(days.length);
    expect(boxes.every((b) => b.checked)).toBe(true);
    expect(screen.getByRole('button', { name: /Legg inn 5 dager/ })).toBeTruthy();
  });

  it('lagrer bare de dagene som står avhuket', async () => {
    const { onApplyGenerated } = setup();
    click(screen.getByRole('button', { name: /Foreslå ny ukemeny/ }));
    const boxes = screen.getAllByRole('checkbox');
    click(boxes[0]);
    click(boxes[1]);
    expect(screen.getByRole('button', { name: /Legg inn 3 dager/ })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Legg inn 3 dager/ }));
    });
    expect(onApplyGenerated).toHaveBeenCalledTimes(1);
    const [chosen] = onApplyGenerated.mock.calls[0];
    expect(chosen.length).toBe(3);
    expect(chosen.map((d) => d.plan_date)).toEqual(days.slice(2));
  });

  it('«Bytt resten» beholder de avhukede og bytter bare resten', () => {
    setup();
    click(screen.getByRole('button', { name: /Foreslå ny ukemeny/ }));
    const before = screen.getAllByRole('checkbox').map(
      (b) => b.getAttribute('aria-label'),
    );
    // Fjern haken på de tre siste, behold de to første.
    const boxes = screen.getAllByRole('checkbox');
    click(boxes[2]); click(boxes[3]); click(boxes[4]);
    click(screen.getByRole('button', { name: /Bytt resten/ }));
    const after = screen.getAllByRole('checkbox').map(
      (b) => b.getAttribute('aria-label'),
    );
    expect(after.length).toBe(days.length);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    expect(screen.getAllByRole('checkbox').every((b) => b.checked)).toBe(true);
  });

  it('ingen React-feil under hele runden', () => {
    setup();
    click(screen.getByRole('button', { name: /Foreslå ny ukemeny/ }));
    click(screen.getAllByRole('checkbox')[0]);
    click(screen.getByRole('button', { name: /Bytt resten/ }));
    expect(console.error).not.toHaveBeenCalled();
  });
});

// En plan som ligner en ekte uke: fylte dager, låst dag, spist dag,
// hoppet over, sendt til handlelisten og gjesteporsjoner.
const richPlan = [
  { plan_date: '2026-09-07', meal_name: 'Taco', meal_id: 'm1', skipped: false, locked: false, done: true, guest_portions: 0, sent_to_list_at: '2026-09-06T10:00:00Z', reason: 'Regel: Taco på denne ukedagen' },
  { plan_date: '2026-09-08', meal_name: 'Fiskegrateng', meal_id: 'm2', skipped: false, locked: true, done: false, guest_portions: 2, sent_to_list_at: null, reason: null },
  { plan_date: '2026-09-09', meal_name: null, meal_id: null, skipped: true, locked: false, done: false, guest_portions: 0, sent_to_list_at: null, reason: null },
  { plan_date: '2026-09-10', meal_name: 'Ukjent rett fra i fjor', meal_id: null, skipped: false, locked: false, done: false, guest_portions: 0, sent_to_list_at: null, reason: null },
  { plan_date: '2026-09-11', meal_name: null, meal_id: null, skipped: false, locked: false, done: false, guest_portions: 0, sent_to_list_at: null, reason: null },
];

const richExtra = {
  plan: richPlan,
  rules: [
    { id: 'r1', scope: 'Fisk', rule_type: 'min_per_week', amount: 2, weekdays: null, enabled: true },
    { id: 'r2', scope: 'Taco', rule_type: 'weekday', amount: null, weekdays: [5], enabled: true },
  ],
  history: [
    { plan_date: '2026-08-31', meal_name: 'Taco' },
    { plan_date: '2026-08-30', meal_name: 'Pizza' },
  ],
  offers: [
    { id: 'o1', product_name: 'Kjøttdeig 400 g', store: 'REMA 1000', price: 39.9, valid_to: '2026-09-14' },
  ],
  catalog: [
    { id: 'c1', name: 'Kjøttdeig', major_category: 'Kjøtt', primary_store: 'REMA 1000', avg_price: 66.5, pack_size: 400, unit: 'g' },
  ],
  mealLibrary: [{ name: 'Omelett', category: 'Annet', ingredients: [{ n: 'Egg', qty: 6 }] }],
};

describe('Middag: dagskortet med ekte data', () => {
  beforeEach(() => { vi.spyOn(console, 'error'); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('rendrer uten feil med låst, spist, hoppet over og sendt dag', () => {
    setup(richExtra);
    expect(screen.getAllByText('Fiskegrateng').length).toBeGreaterThan(0);
    expect(screen.getByText('Ukjent rett fra i fjor')).toBeTruthy();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('«Fjern» tømmer dagen, «Send på nytt» nullstiller sendingen', async () => {
    const onClearDay = vi.fn().mockResolvedValue(null);
    const onUnmarkSent = vi.fn().mockResolvedValue(null);
    setup({ ...richExtra, onClearDay, onUnmarkSent });
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Fjern' })[0]); });
    expect(onClearDay).toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send på nytt' })); });
    expect(onUnmarkSent).toHaveBeenCalledWith(['2026-09-07']);
  });

  it('egen middag skrives inn i velgeren og legges på dagen', async () => {
    const onSaveMeal = vi.fn().mockResolvedValue(null);
    const onSetMeal = vi.fn().mockResolvedValue(null);
    setup({ ...richExtra, onSaveMeal, onSetMeal });
    click(screen.getAllByRole('button', { name: /Legg til middag/ })[0]);
    const field = screen.getByLabelText('Egen middag');
    act(() => { fireEvent.change(field, { target: { value: 'Pizza fra Peppes' } }); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Legg til' })); });
    expect(onSaveMeal).toHaveBeenCalledWith(expect.objectContaining({ name: 'Pizza fra Peppes' }));
    expect(onSetMeal).toHaveBeenCalledWith('2026-09-11', expect.objectContaining({ name: 'Pizza fra Peppes' }));
  });

  it('«Lagre uten å sende» lagrer oppskriften og sender ingenting', async () => {
    const onSaveMeal = vi.fn().mockResolvedValue(null);
    const onSendToList = vi.fn().mockResolvedValue(undefined);
    setup({ ...richExtra, onSaveMeal, onSendToList });
    click(screen.getAllByRole('button', { name: /Legg til i handleliste/ })[0]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Lagre uten å sende' }));
    });
    expect(onSendToList).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('forslag med regler, tilbud og historikk krasjer ikke', () => {
    setup(richExtra);
    click(screen.getByRole('button', { name: /Foreslå ny ukemeny/ }));
    expect(console.error).not.toHaveBeenCalled();
  });
});

describe('Enhet i ingrediens-gjennomgangen', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('bytte fra dl til liter regner om mengden', async () => {
    const onSaveMeal = vi.fn().mockResolvedValue(null);
    const melPlan = [{
      plan_date: '2026-09-07', meal_name: 'Pannekaker', meal_id: 'p1', skipped: false,
      locked: false, done: false, guest_portions: 0, sent_to_list_at: null, reason: null,
    }];
    const melMeals = [{
      id: 'p1', name: 'Pannekaker', category: 'Kos',
      ingredients: [{ n: 'Siktet hvetemel', qty: 20, unit: 'dl' }], saved: true,
    }];
    setup({ plan: melPlan, meals: melMeals, onSaveMeal });
    click(screen.getByRole('button', { name: /Legg til i handleliste/ }));
    expect(screen.getByText('20 dl')).toBeTruthy();
    const unit = screen.getByLabelText('Enhet for Siktet hvetemel');
    act(() => { fireEvent.change(unit, { target: { value: 'liter' } }); });
    expect(screen.getByText('2 liter')).toBeTruthy();
    // Lagres tilbake i oppskriften med den nye enheten.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Lagre uten å sende' }));
    });
    expect(onSaveMeal).toHaveBeenCalledWith(expect.objectContaining({
      ingredients: [{ n: 'Siktet hvetemel', qty: 2, unit: 'liter' }],
    }));
  });
});
