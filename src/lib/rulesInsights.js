// Innsikt for Regler- og Middag-sidene: kostholdshistogram, framdrift mot
// reglene, og forslag til nye regler fra mønsteret i det dere faktisk spiser.

import { mealMatchesScope } from './planner.js';

const DAY = 86400000;
const DAY_NAMES = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];

/** Kategori for et middagsnavn, via husholdningens middager. */
export function categoryOf(name, meals) {
  return meals.find((m) => m.name.toLowerCase() === String(name).toLowerCase())?.category ?? 'Annet';
}

/**
 * «Kosthold siste N uker» — hvor ofte hver kategori har stått på bordet.
 * @param {Array<{name, date}>} history  spiste middager med dato
 */
export function dietHistogram(history, meals, { weeks = 4, today = new Date(), limit = 6 } = {}) {
  const cutoff = new Date(today).getTime() - weeks * 7 * DAY;
  const counts = new Map();

  for (const entry of history) {
    const when = entry.date ? new Date(`${entry.date}T12:00:00`).getTime() : null;
    if (when !== null && when < cutoff) continue;
    const cat = categoryOf(entry.name, meals);
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'nb'))
    .slice(0, limit);
}

/**
 * Framdrift mot ukeskvotene: «2/2 Fisk denne uken».
 * Teller planlagte (ikke oversprungne) middager i planen mot min/max-regler.
 */
export function ruleProgress(rules, plan, meals) {
  const planned = plan.filter((d) => d.meal_name && !d.skipped);
  return rules
    .filter((r) => r.enabled !== false && (r.rule_type === 'min' || r.rule_type === 'max'))
    .map((rule) => {
      const count = planned.filter((d) => {
        const meal = meals.find((m) => m.name === d.meal_name);
        return meal && mealMatchesScope(meal, rule.scope);
      }).length;
      const target = Number(rule.amount) || 1;
      return {
        rule,
        count,
        target,
        value: `${count}/${target}`,
        label: `${rule.scope} denne uken`,
        // maks-regel over kvoten er et varsel; min-regel under er bare uferdig.
        over: rule.rule_type === 'max' && count > target,
        met: rule.rule_type === 'min' ? count >= target : count <= target,
      };
    });
}

/** Dekker en eksisterende regel dette omfanget allerede? */
const covered = (rules, scope) =>
  rules.some((r) => r.enabled !== false && r.scope.toLowerCase() === String(scope).toLowerCase());

/**
 * Foreslåtte regler, fra det dere faktisk spiser.
 * Ærlige heuristikker — ingen forslag uten data bak seg:
 *  - kategori 4+ ganger på 4 uker uten regel → min-regel som holder rytmen
 *  - kategori 1–2 ganger på 4 uker → intervallregel («ca. hver N. uke»)
 */
export function suggestRules(history, meals, rules, { weeks = 4, today = new Date() } = {}) {
  const histogram = dietHistogram(history, meals, { weeks, today, limit: 12 });
  const suggestions = [];

  for (const { label, count } of histogram) {
    if (label === 'Annet' || covered(rules, label)) continue;

    if (count >= weeks) {
      const perWeek = Math.max(1, Math.round(count / weeks));
      suggestions.push({
        id: `min:${label.toLowerCase()}`,
        scope: label,
        rule_type: 'min',
        amount: perWeek,
        weekdays: [],
        title: `${label} min. ${perWeek}×/uke`,
        reason: `${label} sto på menyen ${count} ganger siste ${weeks} uker — en regel holder rytmen når planen genereres.`,
      });
    } else if (count >= 1 && count <= 2) {
      const interval = Math.min(4, Math.max(2, Math.round(weeks / count)));
      suggestions.push({
        id: `interval:${label.toLowerCase()}`,
        scope: label,
        rule_type: 'interval',
        amount: interval,
        weekdays: [],
        title: `${label} ca. hver ${interval}. uke`,
        reason: `${label} dukker opp av og til (${count} ${count === 1 ? 'gang' : 'ganger'} siste ${weeks} uker) — en intervallregel sørger for at det ikke glipper.`,
      });
    }
  }

  return suggestions;
}

// ---------------------------------------------------------------------------
// Visningstekster — samme språk overalt regelen omtales.
// ---------------------------------------------------------------------------
const dayList = (days) => (days ?? []).map((d) => DAY_NAMES[d]).filter(Boolean).join(', ');

export function ruleTitle(rule) {
  const n = Number(rule.amount) || 1;
  switch (rule.rule_type) {
    case 'min': return `${rule.scope} min. ${n}×/uke`;
    case 'max': return `Maks ${n} ${rule.scope.toLowerCase()}/uke`;
    case 'interval': return `${rule.scope} ca. hver ${n}. uke`;
    case 'weekday': return `${rule.scope} på ${dayList(rule.weekdays) || 'valgte dager'}`;
    default: return rule.scope;
  }
}

export function ruleDescription(rule) {
  const n = Number(rule.amount) || 1;
  switch (rule.rule_type) {
    case 'min': return `Minst ${n} ${rule.scope.toLowerCase()}-middag${n > 1 ? 'er' : ''} per uke`;
    case 'max': return `Unngå mer enn ${n} per uke`;
    case 'interval': return `${rule.scope} omtrent hver ${n}.–${n + 1}. uke`;
    case 'weekday': return `Fast på ${dayList(rule.weekdays) || 'valgte dager'}`;
    default: return '';
  }
}

export function ruleChip(rule) {
  const n = Number(rule.amount) || 1;
  switch (rule.rule_type) {
    case 'min': return `Min. ${n}/uke`;
    case 'max': return `Maks ${n}/uke`;
    case 'interval': return `Hver ${n}. uke`;
    case 'weekday': return dayList(rule.weekdays) || 'ukedag';
    default: return '';
  }
}
