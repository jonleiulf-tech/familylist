import { useMemo, useState } from 'react';
import { ChefHat, Store, ChevronRight } from 'lucide-react';
import {
  rankMealsByOffers, cheapestOfDish, availableDishes,
  coverageLabel, savingLabel, storeLabel, hitDetail,
} from '../lib/offerMeals.js';
import { kr } from '../lib/format.js';

/**
 * «Hva kan jeg lage nå?» — tilbudene snudd til middagsforslag.
 *
 * Bevisst ærlig i formuleringene: vi sier hvor mange av varene som er på
 * tilbud, ikke «alt er billig». Mangler førprisen sier vi «minst», aldri
 * et beløp vi ikke kan forsvare.
 */
export function OfferMeals({ meals, offers, onPick, limit = 6 }) {
  const [expanded, setExpanded] = useState(false);
  // null = «alt», ellers en rettfamilie («billigste burger»).
  const [dish, setDish] = useState(null);
  // Hvilket kort som viser regnestykket sitt. Ett av gangen: åpner man
  // alle, er kortene ikke lenger til å skanne nedover.
  const [openDetail, setOpenDetail] = useState(null);

  const dishes = useMemo(() => availableDishes(meals).filter((d) => d.count >= 2), [meals]);
  // Forsvinner den valgte familien fra chipsene (middagene endret seg), står
  // man igjen uten «Alt»-knapp å komme tilbake med.
  const active = dish && dishes.some((d) => d.id === dish) ? dish : null;
  const ranked = useMemo(
    () => (active
      ? cheapestOfDish(active, meals, offers, { limit: 12 })
      : rankMealsByOffers(meals, offers, { limit: 12 })),
    [meals, offers, active],
  );

  // Uten treff i «alt»-visningen finnes det ingenting å vise i det hele
  // tatt. Med en valgt rettfamilie skal seksjonen stå, slik at man kan
  // bytte tilbake — «ingen burger er på tilbud» er også et svar.
  if (!ranked.length && !active) return null;
  const shown = expanded ? ranked : ranked.slice(0, limit);

  return (
    <>
      {/* Seksjonene på Tilbud skilles med det samme sunkne båndet, slik at
          man ser hvor «billig middag» slutter og «utvalgt for dere» tar over. */}
      <hr className="divider" />
      <div className="section-head" style={{ paddingBottom: 2 }}>
        <span className="section-title">
          <ChefHat size={13} style={{ verticalAlign: -2, color: 'var(--color-herb)' }} /> Billig middag akkurat nå
        </span>
        <span className="text-muted tnum" style={{ fontSize: 11 }}>{ranked.length}</span>
      </div>
      <p className="text-muted" style={{ padding: '0 var(--gutter) 8px', fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>
        Middager der flere av ingrediensene er på tilbud denne uka. Hovedvaren
        teller mest — så kroner spart. Velg en type rett for å finne den
        billigste varianten av den.
      </p>

      {dishes.length > 0 && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 6, padding: '0 var(--gutter) 10px' }}>
          <button
            type="button"
            className={`tag tag-button ${active === null ? 'tag-accent' : 'tag-outline'}`}
            aria-pressed={active === null}
            onClick={() => { setDish(null); setExpanded(false); }}
          >
            Alt
          </button>
          {dishes.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`tag tag-button ${active === d.id ? 'tag-accent' : 'tag-outline'}`}
              aria-pressed={active === d.id}
              onClick={() => { setDish(d.id); setExpanded(false); }}
            >
              {d.label}
            </button>
          ))}
        </div>
      )}

      {active && ranked.length === 0 && (
        <p className="text-muted" style={{ padding: '0 var(--gutter) var(--space-3)', fontSize: 13, margin: 0 }}>
          Ingen av disse rettene har varer på tilbud denne uka.
        </p>
      )}

      <div className="stack" style={{ gap: 10, padding: '4px var(--gutter) var(--space-2)' }}>
        {shown.map((s) => {
          const saving = savingLabel(s);
          const store = storeLabel(s);
          return (
            <div key={s.meal.id ?? s.meal.name} className="card" style={{ padding: 'var(--space-3)' }}>
              <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="card-title" style={{ fontSize: 16 }}>{s.meal.name}</div>
                  <div className="card-meta tnum" style={{ marginTop: 3 }}>{coverageLabel(s)}</div>
                </div>
                {saving && s.hits.length > 0 && (
                  <span className={`tag tnum ${s.savedKnown ? 'tag-honey' : 'tag-outline'}`} style={{ whiteSpace: 'nowrap' }}>
                    {saving}
                  </span>
                )}
              </div>

              <div className="row" style={{ flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                {s.hits.slice(0, 5).map((h) => (
                  <span
                    key={h.offer.id}
                    className={`tag tnum ${h.weight >= 1 ? 'tag-herb' : 'tag-outline'}`}
                    title={h.offer.match_name || h.offer.product_name}
                  >
                    {h.ingredient}{h.pct > 0 ? ` −${h.pct}%` : ''}
                  </span>
                ))}
              </div>

              {store && (
                <div className="row" style={{ gap: 5, marginTop: 8 }}>
                  <Store size={12} color="var(--color-text-muted)" aria-hidden="true" />
                  <span className="text-muted" style={{ fontSize: 11.5 }}>{store}</span>
                </div>
              )}

              {/* HVOR TALLENE KOMMER FRA.
                  Kortet sa «Sparer ca. kr 212» og «−58 %» uten å si hva
                  det var regnet av, hvor mange varer det gjaldt, eller
                  hvilken butikk hvert enkelt tilbud lå i. Et beløp uten
                  regnestykke er en påstand. */}
              <button
                type="button"
                className="btn btn-sm"
                style={{ marginTop: 8 }}
                aria-expanded={openDetail === s.meal.id}
                onClick={() => setOpenDetail(openDetail === (s.meal.id ?? s.meal.name)
                  ? null : (s.meal.id ?? s.meal.name))}
              >
                {openDetail === (s.meal.id ?? s.meal.name) ? 'Skjul regnestykket' : 'Hvor kommer tilbudet fra?'}
              </button>

              {openDetail === (s.meal.id ?? s.meal.name) && (
                <div
                  className="stack"
                  style={{
                    gap: 8, marginTop: 8, paddingTop: 8,
                    borderTop: '1px solid var(--color-divider)',
                  }}
                >
                  {s.hits.map((h) => {
                    const d = hitDetail(h);
                    return (
                      <div key={h.offer.id} style={{ fontSize: 12 }}>
                        <div className="row-between" style={{ gap: 8, alignItems: 'baseline' }}>
                          <strong style={{ fontSize: 12.5 }}>{d.ingredient}</strong>
                          {d.store && (
                            <span className="text-muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>
                              {d.store}
                            </span>
                          )}
                        </div>
                        <div className="text-muted" style={{ fontSize: 11.5 }}>{d.product}</div>
                        <div className="tnum" style={{ fontSize: 11.5, marginTop: 2 }}>
                          {[
                            d.count > 1 ? `${d.count} stk` : null,
                            d.price !== null ? `${kr(d.price)} nå` : null,
                            d.original !== null ? `før ${kr(d.original)}` : 'førpris ikke oppgitt',
                            d.saved !== null ? `sparer ${kr(d.saved)}` : null,
                          ].filter(Boolean).join(' · ')}
                        </div>
                        <div className="text-muted" style={{ fontSize: 11 }}>
                          {[
                            d.source,
                            d.valid,
                            d.sure ? null : 'usikkert navnetreff',
                          ].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-muted" style={{ fontSize: 11, margin: 0 }}>
                    {s.savedKnown
                      ? 'Summen er førpris minus tilbudspris, ganget med mengden oppskriften trenger.'
                      : 'Noen av tilbudene mangler førpris, så beløpet er det vi kan dokumentere — ikke mer.'}
                  </p>
                </div>
              )}

              {onPick && (
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ marginTop: 10 }}
                  onClick={() => onPick(s)}
                >
                  Sjekk og legg til varene <ChevronRight size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {ranked.length > limit && (
        <div style={{ padding: '0 var(--gutter) var(--space-3)' }}>
          <button type="button" className="btn btn-block btn-sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Vis færre' : `Se alle ${ranked.length} middagene`}
          </button>
        </div>
      )}
    </>
  );
}
