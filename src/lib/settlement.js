// Oppgjør: hvem har lagt ut for hva, og hvem skylder hvem.
//
// Grunnlaget ligger allerede i dataene: hver plukket vare har checked_by
// (hvem som krysset den av) og en pris. Den som krysser av er den som tar
// varen i butikken, altså den som betaler for den.
//
// Eksempelet fra virkeligheten: tre på hyttetur, lista kommer på 1500 kr.
// Rettferdig andel er 500 hver. Har Pål handlet for 500, er han kvitt.

/** Summerer hva hver person har lagt ut. */
export function spendByPerson(items, members) {
  const totals = new Map(members.map((m) => [m.user_id, 0]));
  let unassigned = 0;

  for (const item of items) {
    if (!item.checked) continue;                 // ikke handlet ennå
    const amount = (Number(item.price) || 0) * (Number(item.qty) || 1);
    if (amount <= 0) continue;

    if (item.checked_by && totals.has(item.checked_by)) {
      totals.set(item.checked_by, totals.get(item.checked_by) + amount);
    } else {
      // Varer krysset av før vi begynte å registrere hvem, eller av noen
      // som siden har forlatt listen. Skal ikke forsvinne fra totalen.
      unassigned += amount;
    }
  }

  return { totals, unassigned };
}

/**
 * Regner ut oppgjøret.
 *
 * @param {object[]} items    shopping_items
 * @param {object[]} members  [{user_id, display_name}]
 * @param {object}   opts     {splitAmong} — user_id-er som deler regningen.
 *                            Utelates den, deles på alle medlemmer.
 */
export function calculateSettlement(items, members, { splitAmong } = {}) {
  const sharers = splitAmong?.length
    ? members.filter((m) => splitAmong.includes(m.user_id))
    : members;

  const { totals, unassigned } = spendByPerson(items, members);
  const total = [...totals.values()].reduce((s, v) => s + v, 0) + unassigned;
  const share = sharers.length ? total / sharers.length : 0;

  const balances = members.map((m) => {
    const spent = totals.get(m.user_id) ?? 0;
    const owes = sharers.some((s) => s.user_id === m.user_id) ? share : 0;
    return {
      user_id: m.user_id,
      display_name: m.display_name,
      spent: round(spent),
      share: round(owes),
      // Positiv: har lagt ut mer enn sin del, skal ha penger tilbake.
      balance: round(spent - owes),
      isSharing: owes > 0 || sharers.some((s) => s.user_id === m.user_id),
    };
  });

  return {
    total: round(total),
    share: round(share),
    unassigned: round(unassigned),
    balances,
    transfers: settleUp(balances),
  };
}

/**
 * Færrest mulig overføringer for å gjøre opp.
 *
 * Grådig: den som skylder mest betaler den som har mest til gode, helt til
 * alle står i null. For små grupper gir det optimalt eller nær-optimalt
 * antall overføringer, og det er lett å forstå hvorfor beløpet ble som det ble.
 */
export function settleUp(balances) {
  const debtors = balances
    .filter((b) => b.balance < -0.01)
    .map((b) => ({ ...b, remaining: -b.balance }))
    .sort((a, b) => b.remaining - a.remaining);

  const creditors = balances
    .filter((b) => b.balance > 0.01)
    .map((b) => ({ ...b, remaining: b.balance }))
    .sort((a, b) => b.remaining - a.remaining);

  const transfers = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].remaining, creditors[j].remaining);
    if (amount > 0.01) {
      transfers.push({
        from: debtors[i].display_name,
        from_id: debtors[i].user_id,
        to: creditors[j].display_name,
        to_id: creditors[j].user_id,
        amount: round(amount),
      });
    }
    debtors[i].remaining -= amount;
    creditors[j].remaining -= amount;
    if (debtors[i].remaining <= 0.01) i += 1;
    if (creditors[j].remaining <= 0.01) j += 1;
  }

  return transfers;
}

const round = (v) => Math.round(v * 100) / 100;
