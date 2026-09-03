import { useMemo, useState } from 'react';
import { History, RefreshCw, UtensilsCrossed, Tag, Target, Droplets, Clock, Package } from 'lucide-react';
import { ReviewDialog } from '../components/ReviewDialog.jsx';
import { estimatedTotal, kr, isoDate, shortDate } from '../lib/format.js';
import { guessUnit, frequentMissing, resolveCatalogItem, piecesPerPack, guessCategory } from '../lib/catalog.js';
import {
  rankOffers, reasonText, discountPercent,
  loadOfferPrefs, saveOfferPrefs, STORE_CODES,
} from '../lib/offers.js';
import { ruleProgress } from '../lib/rulesInsights.js';
import { dayLabel } from '../lib/format.js';
import { safeUrl } from '../lib/safeUrl.js';
import { lower as lowerText } from '../lib/text.js';
import { dueItems, companionsText } from '../lib/purchaseStats.js';
import { buyEarlySuggestions } from '../lib/buyEarly.js';

/** Seksjonsoverskrift med ikon, som i prototypen. */
function Kicker({ icon: Icon, children }) {
  return (
    <div className="row" style={{ gap: 6, padding: 'var(--space-4) var(--space-4) 2px' }}>
      <Icon size={12} color="var(--color-accent)" aria-hidden="true" />
      <span style={{
        fontSize: 11, fontWeight: 600, letterSpacing: '.08em',
        textTransform: 'uppercase', color: 'var(--color-accent)',
      }}>
        {children}
      </span>
    </div>
  );
}

/**
 * Forslag — seks seksjoner, alle «legg til»-flyter gjennom den delte
 * gjennomgangsdialogen: tidligere lister, gjentaksvarer, ingredienser fra
 * middagsplanen, relevante tilbud, regelmål og faste melkefrie varer.
 */
export function Suggestions({
  trips, catalog, normRules, offers, existingNames, defaultStore,
  plan, meals, rules, shopItems, plannedIngredients,
  // Merkelappene lastes asynkront; en fane skal ikke krasje mens de mangler.
  itemTags = { staples: new Set(), dairyFree: new Set() },
  onSendToList, onDeleteTrip, onAddOffer, onGo, toast,
  // Husholdningens kjøpsstatistikk (usePurchaseStats). Uten den finnes
  // hverken «Snart tid for» eller «Kjøp nå, før tilbudet går ut».
  purchases = null,
}) {
  const [review, setReview] = useState(null);
  // «Hopp over» og «lagt til» huskes ut dagen — seksjonen skal ikke stå og
  // mase videre etter at den er håndtert. I morgen er den tilbake.
  const skipKey = `pl.sugg.skip.${isoDate(new Date())}`;
  const [skippedSections, setSkippedSections] = useState(() => {
    try { return JSON.parse(localStorage.getItem(skipKey) ?? '{}'); } catch { return {}; }
  });
  const [prefs, setPrefs] = useState(loadOfferPrefs);
  const skip = (key, handled = false) => setSkippedSections((cur) => {
    const next = { ...cur, [key]: handled ? 'handled' : 'skipped' };
    try { localStorage.setItem(skipKey, JSON.stringify(next)); } catch { /* ignorer */ }
    return next;
  });

  const repeats = useMemo(
    () => frequentMissing(catalog, existingNames),
    [catalog, existingNames],
  );

  // Fase 4: varer det snart er tid for (§19), og tilbud det lønner seg å
  // ta NÅ fordi de går ut før neste vanlige kjøp (§17–18). Begge regnes
  // av husholdningens egne kjøpslinjer; ingen av dem legger til noe selv.
  const due = useMemo(
    () => dueItems(purchases?.next, existingNames),
    [purchases, existingNames],
  );
  const buyEarly = useMemo(
    () => buyEarlySuggestions({ offers, byItem: purchases?.byItem, next: purchases?.next, catalog, existingNames }),
    [offers, purchases, catalog, existingNames],
  );

  const toRow = (name, qty = 1, unit = null) => {
    const { name: resolved, item } = resolveCatalogItem(name, catalog, normRules);
    const chosenUnit = unit || guessUnit(resolved, item?.major_category, qty);
    return {
      name: resolved,
      qty,
      // Bruk oppskriftens enhet; gjett bare når den mangler (og da med qty,
      // ellers blir «600 g» til «600 pakke»).
      unit: chosenUnit,
      // Telte biter: prisen gjelder én pakke, så antatt antall per pakke
      // må med — ellers blir «8 pølser» åtte pakker i prisanslaget.
      pack_size: chosenUnit === 'stk' ? piecesPerPack(resolved) : null,
      category: item?.major_category || guessCategory(resolved),
      store: item?.primary_store || defaultStore,
      price: item?.avg_price ?? null,
      price_source: item?.avg_price ? 'receipt' : null,
    };
  };

  // Ingredienser fra ukens planlagte middager, summert per vare. Bare like
  // enheter summeres — ellers holdes de fra hverandre (600 g + 1 pakke skal
  // ikke bli 601), med enheten båret videre til gjennomgangen.
  const weekIngredients = useMemo(() => {
    const totals = new Map();
    plan.forEach((day) => {
      if (!day.meal_name || day.skipped) return;
      const meal = meals.find((m) => m.name === day.meal_name);
      (meal?.ingredients ?? []).forEach((ing) => {
        const key = `${lowerText(ing.n)}|${ing.unit ?? ''}`;
        const prev = totals.get(key);
        totals.set(key, {
          n: ing.n,
          unit: ing.unit ?? null,
          qty: (prev?.qty ?? 0) + (Number(ing.qty) || 1),
        });
      });
    });
    return [...totals.values()];
  }, [plan, meals]);

  // Middagsbasert: første planlagte middag som mangler ingredienser på
  // listen — «Til tacofredag mangler dere: …».
  const mealCallout = useMemo(() => {
    for (const day of plan) {
      if (!day.meal_name || day.skipped) continue;
      const meal = meals.find((m) => m.name === day.meal_name);
      if (!meal?.ingredients?.length) continue;
      const missing = meal.ingredients.filter((ing) => {
        const { name } = resolveCatalogItem(ing.n, catalog, normRules);
        return !existingNames.has(lowerText(name));
      });
      if (missing.length) return { day, meal, missing };
    }
    return null;
  }, [plan, meals, catalog, normRules, existingNames]);

  // Relevante tilbud, samme scoring som Tilbud-fanen.
  const offerCtx = useMemo(() => ({
    catalog,
    shopItems,
    plannedIngredients,
    staples: itemTags?.staples ?? new Set(),
    dairyFree: itemTags?.dairyFree ?? new Set(),
    defaultStoreCode: STORE_CODES[defaultStore] ?? 'COOP_EXTRA',
  }), [catalog, shopItems, plannedIngredients, itemTags, defaultStore]);
  const ranked = useMemo(() => rankOffers(offers, offerCtx, prefs), [offers, offerCtx, prefs]);
  const today = isoDate(new Date());
  const validCount = useMemo(
    () => offers.filter((o) => !o.valid_to || o.valid_to >= today).length,
    [offers, today],
  );

  const hideOffer = (offer, mode) => {
    const next = { ...prefs, [offer.id]: mode };
    setPrefs(next);
    saveOfferPrefs(next);
    toast(mode === 'not_relevant' ? 'Merket som ikke relevant' : 'Skjult til neste uke');
  };

  // Regelmål: første ukeskvote («Fiskemål» i prototypen).
  const goal = useMemo(
    () => ruleProgress(rules ?? [], plan, meals)
      .filter((p) => p.rule.rule_type === 'min')[0] ?? null,
    [rules, plan, meals],
  );

  // Faste melkefrie varer, med på-listen-status.
  const dairyFreeItems = useMemo(() => {
    const names = [...itemTags.dairyFree];
    return names.map((lower) => {
      const cat = catalog.find((c) => lowerText(c.name) === lower);
      const name = cat?.name ?? lower.charAt(0).toUpperCase() + lower.slice(1);
      return { name, onList: existingNames.has(lower), catalogItem: cat };
    });
  }, [itemTags.dairyFree, catalog, existingNames]);

  const fmtDate = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : '');

  return (
    <div>
      {/* ---------- 1. Tidligere lister ---------- */}
      <Kicker icon={History}>Bruk en av dine tidligere lister</Kicker>
      {trips.length === 0 && (
        <p className="text-muted" style={{ padding: '4px var(--space-4) var(--space-2)', fontSize: 13, margin: 0 }}>
          Ingen lagrede lister ennå. Kryss av «Lagre handlelisten» når du
          fullfører en handletur.
        </p>
      )}
      {trips.slice(0, 10).map((t) => {
        const total = estimatedTotal(t.items ?? []);
        return (
          <div key={t.id} className="item-row" style={{ alignItems: 'flex-start' }}>
            <div className="item-mid" style={{ cursor: 'default' }}>
              <div className="item-name">{t.name}</div>
              <div className="item-sub">
                {(t.items ?? []).length} varer · {shortDate(t.trip_date)} · {total.label}
              </div>
              <div className="item-sub">
                {(t.items ?? []).slice(0, 4).map((i) => i.name).join(', ')}
                {(t.items ?? []).length > 4 ? ` +${(t.items ?? []).length - 4}` : ''}
              </div>
            </div>
            <div className="stack" style={{ gap: 4 }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setReview({
                  title: t.name,
                  rows: (t.items ?? []).map((i) => ({ ...i, qty: Number(i.qty) || 1 })),
                })}
              >
                Bruk listen
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDeleteTrip(t)}>
                Slett
              </button>
            </div>
          </div>
        );
      })}
      {trips.length > 0 && (
        <p className="text-muted" style={{ padding: '6px var(--space-4) 0', fontSize: 11, margin: 0 }}>
          Du gjennomgår varene før de legges til — hak av og juster antall som vanlig.
        </p>
      )}

      {/* ---------- 2. Ukentlige varer ---------- */}
      {skippedSections.weekly === 'handled' && (
        <>
          <hr className="divider" style={{ height: 1, background: 'var(--color-divider-soft)' }} />
          <Kicker icon={RefreshCw}>Ukentlige varer</Kicker>
          <p className="text-muted" style={{ padding: '2px var(--space-4) var(--space-3)', fontSize: 13, margin: 0 }}>
            <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>✓ Håndtert i dag</span> — nye gjentaksvarer dukker opp i morgen.
          </p>
        </>
      )}
      {!skippedSections.weekly && repeats.length > 0 && (
        <>
          <hr className="divider" style={{ height: 1, background: 'var(--color-divider-soft)' }} />
          <Kicker icon={RefreshCw}>Ukentlige varer</Kicker>
          <div style={{ padding: '2px var(--space-4) var(--space-4)' }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, letterSpacing: '-0.015em' }}>
              {repeats.length} varer dere kjøper igjen og igjen
            </div>
            <p style={{ fontSize: 13, margin: '6px 0 10px' }}>
              Kjøpt jevnlig på kvitteringene deres (Coop, MENY, REMA) — og
              mangler fra listen nå. Inntil 50 vises, oftest kjøpt først.
              Gjennomgå og velg i neste steg.
            </p>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 'var(--space-3)' }}>
              {repeats.slice(0, 8).map((c) => <span key={c.name} className="tag tag-outline">{c.name}</span>)}
              {repeats.length > 8 && (
                <span className="tag" style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}>
                  + {repeats.length - 8} flere gjentaksvarer
                </span>
              )}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setReview({
                  title: 'Varer dere kjøper ofte',
                  section: 'weekly',
                  rows: repeats.map((c) => toRow(c.name)),
                })}
              >
                Gjennomgå og legg til
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => skip('weekly')}>Hopp over</button>
            </div>
          </div>
        </>
      )}

      {/* ---------- 2b. Snart tid for (§19) ---------- */}
      {!skippedSections.due && due.length > 0 && (
        <>
          <hr className="divider" style={{ height: 1, background: 'var(--color-divider-soft)' }} />
          <Kicker icon={Clock}>Snart tid for</Kicker>
          <div style={{ padding: '2px var(--space-4) var(--space-4)' }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, letterSpacing: '-0.015em' }}>
              {due.length} {due.length === 1 ? 'vare' : 'varer'} dere snart trenger
            </div>
            <p style={{ fontSize: 13, margin: '6px 0 10px' }}>
              Regnet av hvor ofte dere pleier å kjøpe dem — og de mangler fra
              listen nå. Et forslag, ikke en fasit.
            </p>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 'var(--space-3)' }}>
              {due.map((n) => (
                <span key={n.name} className="tag tag-outline" title={companionsText(purchases?.together?.get(lowerText(n.name))) ?? undefined}>
                  {n.name} <span className="text-muted">· ca. hver {Math.round(n.median_days_between)}. dag</span>
                </span>
              ))}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setReview({
                  title: 'Varer det snart er tid for',
                  section: 'due',
                  rows: due.map((n) => toRow(n.name, Math.max(1, Math.round(purchases?.byItem?.get(lowerText(n.name))?.avg_qty ?? 1)))),
                })}
              >
                Gjennomgå og legg til
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => skip('due')}>Hopp over</button>
            </div>
          </div>
        </>
      )}

      {/* ---------- 2c. Kjøp nå, før tilbudet går ut (§17–18) ---------- */}
      {!skippedSections.buyearly && buyEarly.length > 0 && (
        <>
          <hr className="divider" style={{ height: 1, background: 'var(--color-divider-soft)' }} />
          <Kicker icon={Package}>Kjøp nå, før tilbudet går ut</Kicker>
          <div style={{ padding: '2px var(--space-4) var(--space-2)' }}>
            <p style={{ fontSize: 13, margin: '0 0 6px' }}>
              Varer dere kjøper jevnlig, som tåler å ligge, og som er billigere
              enn dere pleier å betale — men tilbudet går ut før neste kjøp.
            </p>
          </div>
          {buyEarly.map((s) => (
            <div key={`${s.offer.id ?? s.name}`} style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-divider-soft)' }}>
              <div className="row-between">
                <span className="item-name">{s.name}</span>
                {s.offer.store_name && <span className="tag tag-outline">{s.offer.store_name}</span>}
              </div>
              <div className="row" style={{ gap: 8, alignItems: 'baseline', marginTop: 4 }}>
                <span className="tnum" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 21, color: 'var(--color-accent)', letterSpacing: '-0.02em' }}>
                  {kr(s.price)}
                </span>
                <span className="text-muted tnum" style={{ fontSize: 12 }}>dere betaler vanligvis ca. {kr(s.usual)}</span>
              </div>
              <div className="item-sub" style={{ marginTop: 4, color: 'var(--color-text)' }}>{s.reason}</div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setReview({
                    title: `${s.name} — kjøp nå`,
                    section: 'buyearly',
                    rows: [{ ...toRow(s.name, s.qty), store: s.offer.store_name ?? defaultStore, price: s.price, price_source: 'manual' }],
                  })}
                >
                  Legg til {s.qty} stk
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => skip('buyearly')}>Ikke nå</button>
              </div>
            </div>
          ))}
        </>
      )}

      {/* ---------- 3. Fra middagsplanen ---------- */}
      {!skippedSections.mealplan && weekIngredients.length > 0 && (
        <>
          <hr className="divider" style={{ height: 1, background: 'var(--color-divider-soft)' }} />
          <Kicker icon={UtensilsCrossed}>Fra middagsplanen</Kicker>
          <div style={{ padding: '2px var(--space-4) var(--space-4)' }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, letterSpacing: '-0.015em' }}>
              Ingredienser til ukens middager
            </div>
            <p style={{ fontSize: 13, margin: '6px 0 10px' }}>
              Sjekker mot handlelisten og slår sammen mengder før noe legges
              til — ingen duplikater.
            </p>
            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setReview({
                  title: 'Ingredienser til ukens middager',
                  section: 'mealplan',
                  rows: weekIngredients.map((ing) => toRow(ing.n, ing.qty, ing.unit)),
                })}
              >
                Sjekk og legg til
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => skip('mealplan')}>Hopp over</button>
            </div>
          </div>
        </>
      )}

      {/* ---------- 3b. Middagsbasert ---------- */}
      {!skippedSections.mealcallout && mealCallout && (
        <>
          <hr className="divider" style={{ height: 1, background: 'var(--color-divider-soft)' }} />
          <Kicker icon={UtensilsCrossed}>Middagsbasert</Kicker>
          <div style={{ padding: '2px var(--space-4) var(--space-4)' }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, letterSpacing: '-0.015em' }}>
              Til {lowerText(mealCallout.meal.name)} ({lowerText(dayLabel(mealCallout.day.plan_date))}) mangler dere
            </div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6, margin: '10px 0 12px' }}>
              {mealCallout.missing.map((ing) => (
                <span key={ing.n} className="tag tag-outline">{ing.n}</span>
              ))}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setReview({
                  title: `Til ${mealCallout.meal.name}`,
                  section: 'mealcallout',
                  rows: mealCallout.missing.map((ing) => toRow(ing.n, ing.qty, ing.unit)),
                })}
              >
                Sjekk og legg til
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => skip('mealcallout')}>Hopp over</button>
            </div>
          </div>
        </>
      )}

      {/* ---------- 4. Ukens relevante tilbud ---------- */}
      <hr className="divider" />
      <div className="row-between" style={{ paddingRight: 'var(--space-4)' }}>
        <Kicker icon={Tag}>Ukens relevante tilbud</Kicker>
        <span className="text-muted" style={{ fontSize: 11 }}>
          {ranked.length} av {validCount} tilbud passer dere
        </span>
      </div>
      <p className="text-muted" style={{ padding: '0 var(--space-4)', fontSize: 11, margin: '2px 0 4px' }}>
        Skannes automatisk mot kjøpshistorikk og middagsplan.
      </p>

      {ranked.slice(0, 4).map(({ offer, reasons, onList }) => {
        const save = offer.original_price ? Math.round(offer.original_price - offer.price) : 0;
        const otherStore = offer.store_name && offer.store_name !== defaultStore;
        return (
          <div key={offer.id} style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-divider-soft)' }}>
            <div className="row-between">
              <span className="item-name">{offer.product_name}</span>
              {offer.store_name && <span className="tag tag-outline">{offer.store_name}</span>}
            </div>
            <div className="row" style={{ gap: 8, alignItems: 'baseline', marginTop: 4 }}>
              <span className="tnum" style={{
                fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 21,
                color: 'var(--color-accent)', letterSpacing: '-0.02em',
              }}>
                {kr(offer.price)}
              </span>
              {offer.original_price && (
                <>
                  <s className="text-muted tnum" style={{ fontSize: 12 }}>Vanlig ca. {kr(offer.original_price)}</s>
                  {save > 0 && <span className="tnum" style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-honey)' }}>Spar ca. {kr(save)}</span>}
                </>
              )}
            </div>
            {reasons.length > 0 && (
              <div className="item-sub" style={{ marginTop: 4, color: 'var(--color-text)' }}>{reasonText(reasons)}</div>
            )}
            {onList && (
              <div className="item-sub" style={{ color: 'var(--color-accent)' }}>
                Ligger allerede på listen ({onList.qty} {onList.unit})
              </div>
            )}
            <div className="item-sub" style={{ marginTop: 3 }}>
              {offer.valid_to && <>Gyldig til {fmtDate(offer.valid_to)} · </>}
              {offer.source}
              {offer.source_url && (
                <> · <a href={safeUrl(offer.source_url)} target="_blank" rel="noreferrer noopener">Se tilbudet ↗</a></>
              )}
            </div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => onAddOffer(offer)}>
                Legg til
              </button>
              {otherStore && (
                <button type="button" className="btn btn-sm" onClick={() => onAddOffer(offer, defaultStore)}>
                  Legg til som {defaultStore}-vare
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => hideOffer(offer, 'later')}>Ikke nå</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => hideOffer(offer, 'not_relevant')}>Ikke relevant</button>
            </div>
          </div>
        );
      })}
      {ranked.length === 0 && (
        <p className="text-muted" style={{ padding: '4px var(--space-4) var(--space-3)', fontSize: 13, margin: 0 }}>
          Ingen av tilbudene treffer handlemønsteret deres akkurat nå.
        </p>
      )}
      <div style={{ padding: 'var(--space-3) var(--space-4)' }}>
        <button type="button" className="btn btn-block" onClick={() => onGo('tilbud')}>
          Vis flere tilbud <span style={{ marginLeft: 'auto' }}>→</span>
        </button>
      </div>

      {/* ---------- 5. Regelmål ---------- */}
      {!skippedSections.goal && goal && (
        <>
          <hr className="divider" style={{ height: 1, background: 'var(--color-divider-soft)' }} />
          <Kicker icon={Target}>{goal.rule.scope}-mål</Kicker>
          <div style={{ padding: '2px var(--space-4) var(--space-4)' }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, letterSpacing: '-0.015em' }}>
              {goal.count} av {goal.target} {lowerText(goal.rule.scope)}middager planlagt
            </div>
            <p style={{ fontSize: 13, margin: '6px 0 10px' }}>
              Husregel: minst {goal.target} {lowerText(goal.rule.scope)}middager per uke.
              {!goal.met && ' Planlegg en til i ukemenyen.'}
            </p>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn btn-primary" onClick={() => onGo('middag')}>
                {goal.met ? 'Se ukemenyen' : `Planlegg ${lowerText(goal.rule.scope)}rett`}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => skip('goal')}>Hopp over</button>
            </div>
          </div>
        </>
      )}

      {/* ---------- 6. Melkefritt ---------- */}
      {dairyFreeItems.length > 0 && (
        <>
          <hr className="divider" style={{ height: 1, background: 'var(--color-divider-soft)' }} />
          <Kicker icon={Droplets}>Melkefritt</Kicker>
          <div style={{ padding: '2px var(--space-4) var(--space-5)' }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, letterSpacing: '-0.015em' }}>
              Faste melkefrie varer
            </div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {dairyFreeItems.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className={`tag tag-button ${item.onList ? 'tag-outline' : 'tag-accent'}`}
                  disabled={item.onList}
                  style={item.onList ? { cursor: 'default' } : undefined}
                  onClick={() => setReview({ title: 'Melkefri vare', rows: [toRow(item.name)] })}
                >
                  {item.name}{item.onList ? ' · på listen' : ''}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {review && (
        <ReviewDialog
          title={review.title}
          subtitle="Det som alt ligger på listen står nederst, uten hake"
          rows={review.rows}
          existingNames={existingNames}
          onCancel={() => setReview(null)}
          onResolveName={(name) => ({ ...toRow(name), pack_size: null })}
          onSubmit={async (rows) => {
            await onSendToList(rows);
            // Seksjonen er håndtert for i dag — den skal ikke bli stående og mase.
            if (review.section) skip(review.section, true);
            setReview(null);
          }}
        />
      )}
    </div>
  );
}
