import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { isoDate } from '../lib/format.js';

/** Middagsplanen og husholdningens lagrede middager (familieoppskrifter). */
export function useMealPlan(householdId) {
  const [plan, setPlan] = useState([]);
  const [meals, setMeals] = useState([]);
  // Middager spist tidligere, nyeste først — brukes for å unngå gjentak.
  const [history, setHistory] = useState([]);
  // Lagrede ukemaler («Hvit uke», «Vegansk uke» …) for gjenbruk.
  const [weekTemplates, setWeekTemplates] = useState([]);

  const load = useCallback(async () => {
    if (!householdId) return;
    const today = isoDate(new Date());
    const [p, m, h, t] = await Promise.all([
      supabase.from('meal_plan').select('*')
        .eq('household_id', householdId).gte('plan_date', today).order('plan_date'),
      supabase.from('meals').select('*').eq('household_id', householdId).order('name'),
      supabase.from('meal_plan').select('meal_name, plan_date')
        .eq('household_id', householdId).lte('plan_date', today)
        .not('meal_name', 'is', null)
        .order('plan_date', { ascending: false }).limit(60),
      supabase.from('meal_week_templates').select('*')
        .eq('household_id', householdId).order('name'),
    ]);
    setPlan(p.data ?? []);
    setMeals(m.data ?? []);
    setHistory((h.data ?? []).map((r) => ({ name: r.meal_name, date: r.plan_date })));
    setWeekTemplates(t.data ?? []);
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
        instructions_url: meal.instructions_url ?? null,
        source_label: meal.source_label ?? null,
        base_servings: meal.base_servings ?? null,
      }).select().single();
      mealId = data?.id ?? null;
      if (!mealId) {
        // Fantes fra før (unik på navn) — slå opp id-en i stedet.
        const { data: ex } = await supabase.from('meals').select('id')
          .eq('household_id', householdId).eq('name', meal.name).maybeSingle();
        mealId = ex?.id ?? null;
      }
    }
    await supabase.from('meal_plan').upsert({
      household_id: householdId,
      plan_date: date,
      meal_id: mealId,
      meal_name: meal.name,
      skipped: false,
      sent_to_list_at: null,      // ny middag → gammelt «sendt»-merke bort
    }, { onConflict: 'household_id,plan_date' });
    await load();
  }, [householdId, meals, load]);

  const skipDay = useCallback(async (date) => {
    await supabase.from('meal_plan')
      .update({ skipped: true, meal_id: null, meal_name: null, sent_to_list_at: null })
      .eq('household_id', householdId).eq('plan_date', date);
    await load();
  }, [householdId, load]);

  /**
   * Stemple dager som «sendt til handlelisten» — dagskortet viser da et
   * merke som lenker til Handel i stedet for at appen hopper dit selv.
   */
  const markSent = useCallback(async (dates) => {
    if (!dates?.length) return;
    await supabase.from('meal_plan')
      .update({ sent_to_list_at: new Date().toISOString() })
      .eq('household_id', householdId).in('plan_date', dates);
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
        sent_to_list_at: null,
      })),
      { onConflict: 'household_id,plan_date' },
    );
    await load();
  }, [householdId, meals, load]);

  /**
   * Lagre familieoppskrift — ny middag eller redigerte mengder på en
   * eksisterende. Gjenbrukes alle steder middagen refereres.
   * Valgfrie felter (fremgangsmåte, kildelenke, porsjonsbasis) lagres kun
   * når de er med i kallet — utelatte felter røres ikke.
   */
  const saveMeal = useCallback(async (meal) => {
    const patch = { name: meal.name, category: meal.category, ingredients: meal.ingredients };
    for (const key of ['instructions', 'instructions_url', 'source_label', 'base_servings']) {
      if (key in meal) patch[key] = meal[key];
    }
    const { error } = meal.id
      ? await supabase.from('meals').update(patch).eq('id', meal.id)
      : await supabase.from('meals').insert({ household_id: householdId, ...patch });
    if (error) return error.code === '23505'
      ? 'En middag med det navnet finnes allerede.'
      : error.message;
    await load();
    return null;
  }, [householdId, load]);

  /**
   * Gjester på ÉN bestemt middag (bestemor på søndag): ekstra porsjoner
   * utover familiens faste porsjonstall. Bare den dagens mengder skaleres.
   */
  const setGuests = useCallback(async (date, guestPortions) => {
    await supabase.from('meal_plan')
      .update({ guest_portions: guestPortions })
      .eq('household_id', householdId).eq('plan_date', date);
    await load();
  }, [householdId, load]);

  /** Sletter middagen. Planlagte dager beholder navnet (meal_name består). */
  const deleteMeal = useCallback(async (id) => {
    const { error } = await supabase.from('meals').delete().eq('id', id);
    if (error) return error.message;
    await load();
    return null;
  }, [load]);

  /**
   * Fjern den SISTE dagen i planen — motstykket til «+ Legg til en dag».
   * Låste dager og dager som alt er spist røres aldri. Middagen selv
   * (familieoppskriften) består; det er bare plandagen som forsvinner.
   */
  const removeLastDay = useCallback(async () => {
    const last = plan[plan.length - 1];
    if (!last) return 'Planen er tom.';
    if (last.locked) return 'Siste dag er låst — lås den opp først.';
    if (last.done) return 'Siste dag er allerede spist.';
    await supabase.from('meal_plan')
      .delete()
      .eq('household_id', householdId).eq('plan_date', last.plan_date);
    await load();
    return null;
  }, [plan, householdId, load]);

  /**
   * Lagre planens middagsdager som en navngitt ukemal («Hvit uke»).
   * Lagres som dag-forskyvninger fra første middag, så malen kan settes
   * inn fra hvilken som helst dato senere.
   */
  const saveWeekTemplate = useCallback(async (name) => {
    const withMeals = plan.filter((d) => d.meal_name && !d.skipped);
    if (!withMeals.length) return 'Planen har ingen middager å lagre.';
    const first = new Date(`${withMeals[0].plan_date}T12:00:00`);
    const days = withMeals.slice(0, 14).map((d) => ({
      offset: Math.round((new Date(`${d.plan_date}T12:00:00`) - first) / 864e5),
      meal_name: d.meal_name,
    }));
    const { error } = await supabase.from('meal_week_templates').upsert(
      { household_id: householdId, name: name.trim(), days },
      { onConflict: 'household_id,name' },
    );
    if (error) return error.message;
    await load();
    return null;
  }, [plan, householdId, load]);

  /**
   * Sett inn en ukemal fra en valgt dato. Låste dager og dager som alt er
   * spist hoppes over; alt annet overskrives med malens middager.
   */
  const applyWeekTemplate = useCallback(async (template, startDate) => {
    const byName = new Map(meals.map((m) => [m.name.toLowerCase(), m.id]));
    const protectedDates = new Set(
      plan.filter((d) => d.locked || d.done).map((d) => d.plan_date),
    );
    const rows = [];
    for (const day of template.days ?? []) {
      const date = new Date(`${startDate}T12:00:00`);
      date.setDate(date.getDate() + (Number(day.offset) || 0));
      const key = isoDate(date);
      if (protectedDates.has(key)) continue;
      rows.push({
        household_id: householdId,
        plan_date: key,
        meal_id: byName.get(String(day.meal_name).toLowerCase()) ?? null,
        meal_name: day.meal_name,
        reason: `Fra malen «${template.name}»`,
        skipped: false,
        sent_to_list_at: null,
      });
    }
    if (!rows.length) return 'Alle dagene i perioden er låst eller spist.';
    await supabase.from('meal_plan').upsert(rows, { onConflict: 'household_id,plan_date' });
    await load();
    return null;
  }, [plan, meals, householdId, load]);

  const deleteWeekTemplate = useCallback(async (id) => {
    await supabase.from('meal_week_templates').delete().eq('id', id);
    await load();
  }, [load]);

  /** Lås en dag mot «Foreslå ny ukemeny» — eller lås den opp igjen. */
  const toggleLock = useCallback(async (date, locked) => {
    await supabase.from('meal_plan')
      .update({ locked })
      .eq('household_id', householdId).eq('plan_date', date);
    await load();
  }, [householdId, load]);

  const todaysMeal = plan.find((d) => d.plan_date === isoDate(new Date())) ?? null;

  return {
    plan, meals, history, weekTemplates, todaysMeal,
    addDays, removeLastDay, setMeal, skipDay, toggleLock, saveMeal, setGuests,
    markSent, deleteMeal, applyGenerated,
    saveWeekTemplate, applyWeekTemplate, deleteWeekTemplate,
    reload: load,
  };
}
