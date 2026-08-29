import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { isoDate } from '../lib/format.js';

/** Middagsplanen og husholdningens lagrede middager (familieoppskrifter). */
export function useMealPlan(householdId) {
  const [plan, setPlan] = useState([]);
  const [meals, setMeals] = useState([]);
  // Middager spist tidligere, nyeste først — brukes for å unngå gjentak.
  const [history, setHistory] = useState([]);

  const load = useCallback(async () => {
    if (!householdId) return;
    const today = isoDate(new Date());
    const [p, m, h] = await Promise.all([
      supabase.from('meal_plan').select('*')
        .eq('household_id', householdId).gte('plan_date', today).order('plan_date'),
      supabase.from('meals').select('*').eq('household_id', householdId).order('name'),
      supabase.from('meal_plan').select('meal_name')
        .eq('household_id', householdId).lt('plan_date', today)
        .not('meal_name', 'is', null)
        .order('plan_date', { ascending: false }).limit(30),
    ]);
    setPlan(p.data ?? []);
    setMeals(m.data ?? []);
    setHistory((h.data ?? []).map((r) => r.meal_name));
  }, [householdId]);

  useEffect(() => { load(); }, [load]);

  /** Legger til de neste n dagene som ikke allerede finnes i planen. */
  const addDays = useCallback(async (n) => {
    const existing = new Set(plan.map((d) => d.plan_date));
    const rows = [];
    const cursor = new Date();
    while (rows.length < n) {
      const key = isoDate(cursor);
      if (!existing.has(key)) rows.push({ household_id: householdId, plan_date: key });
      cursor.setDate(cursor.getDate() + 1);
    }
    await supabase.from('meal_plan').upsert(rows, { onConflict: 'household_id,plan_date' });
    await load();
  }, [plan, householdId, load]);

  /**
   * Setter middag for en dag. Middager fra biblioteket lagres samtidig som
   * husholdningens egen middag, slik at redigerte mengder blir familieoppskrift.
   */
  const setMeal = useCallback(async (date, meal) => {
    let mealId = meals.find((m) => m.name === meal.name)?.id ?? null;
    if (!mealId) {
      const { data } = await supabase.from('meals').insert({
        household_id: householdId,
        name: meal.name,
        category: meal.category ?? null,
        ingredients: meal.ingredients ?? [],
      }).select().single();
      mealId = data?.id ?? null;
    }
    await supabase.from('meal_plan').upsert({
      household_id: householdId,
      plan_date: date,
      meal_id: mealId,
      meal_name: meal.name,
      skipped: false,
    }, { onConflict: 'household_id,plan_date' });
    await load();
  }, [householdId, meals, load]);

  const skipDay = useCallback(async (date) => {
    await supabase.from('meal_plan')
      .update({ skipped: true, meal_id: null, meal_name: null })
      .eq('household_id', householdId).eq('plan_date', date);
    await load();
  }, [householdId, load]);

  /**
   * Skriver et generert planforslag til databasen.
   * Middager fra biblioteket som ikke finnes hos husholdningen fra før,
   * opprettes samtidig, slik at mengdene kan redigeres som familieoppskrift.
   */
  const applyGenerated = useCallback(async (suggestions, allMeals) => {
    if (!suggestions.length) return;

    const byName = new Map(meals.map((m) => [m.name, m.id]));
    const missing = suggestions
      .map((s) => s.meal_name)
      .filter((name, i, arr) => !byName.has(name) && arr.indexOf(name) === i);

    if (missing.length) {
      const rows = missing.map((name) => {
        const src = allMeals.find((m) => m.name === name);
        return {
          household_id: householdId,
          name,
          category: src?.category ?? null,
          ingredients: src?.ingredients ?? [],
        };
      });
      const { data } = await supabase.from('meals').insert(rows).select();
      (data ?? []).forEach((m) => byName.set(m.name, m.id));
    }

    await supabase.from('meal_plan').upsert(
      suggestions.map((s) => ({
        household_id: householdId,
        plan_date: s.plan_date,
        meal_id: byName.get(s.meal_name) ?? null,
        meal_name: s.meal_name,
        reason: s.reason,
        skipped: false,
      })),
      { onConflict: 'household_id,plan_date' },
    );
    await load();
  }, [householdId, meals, load]);

  const todaysMeal = plan.find((d) => d.plan_date === isoDate(new Date())) ?? null;

  return { plan, meals, history, todaysMeal, addDays, setMeal, skipDay, applyGenerated, reload: load };
}
