import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { isoDate } from '../lib/format.js';

/** Middagsplanen og husholdningens lagrede middager (familieoppskrifter). */
export function useMealPlan(householdId) {
  const [plan, setPlan] = useState([]);
  const [meals, setMeals] = useState([]);

  const load = useCallback(async () => {
    if (!householdId) return;
    const today = isoDate(new Date());
    const [p, m] = await Promise.all([
      supabase.from('meal_plan').select('*')
        .eq('household_id', householdId).gte('plan_date', today).order('plan_date'),
      supabase.from('meals').select('*').eq('household_id', householdId).order('name'),
    ]);
    setPlan(p.data ?? []);
    setMeals(m.data ?? []);
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

  const todaysMeal = plan.find((d) => d.plan_date === isoDate(new Date())) ?? null;

  return { plan, meals, todaysMeal, addDays, setMeal, skipDay, reload: load };
}
