import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Sparkles, BookOpen, Check, Star, Tag, X, UtensilsCrossed } from 'lucide-react';
import { ReviewDialog } from '../components/ReviewDialog.jsx';
import { Stepper } from '../components/Stepper.jsx';
import { supabase } from '../lib/supabase.js';
import { estimatedTotal, dayLabel, isoDate, longDate, kr } from '../lib/format.js';
import { frequentMissing, guessUnit } from '../lib/catalog.js';
import { ruleProgress } from '../lib/rulesInsights.js';
import { matchOffersToPlan } from '../lib/offerMatch.js';

export function Home({
  household, items, onToggle, onStep, plan, meals, catalog, rules, offers,
  existingNames, defaultStore, onGo, onGoInspiration, onSendToList,
}) {
  const [review, setReview] = useState(null);

  // Plukkepoeng-saldoen — liten stjerne i hilsenen, full oversikt i profilen.
  const [pointSum, setPointSum] = useState(null);
  useEffect(() => {
    supabase.from('point_events').select('points')
      .then(({ data }) => {
        if (data) setPointSum(data.reduce((s, r) => s + (Number(r.points) || 0), 0));
      });
  }, []);

  // Kokeboka vokser hver time (automatisk høsting) — vis ferskt antall.
  const [cookbookCount, setCookbookCount] = useState(null);
  useEffect(() => {
    supabase.from('external_recipe_candidates')
      .select('*', { count: 'exact', head: true })
      .then(({ count }) => setCookbookCount(count ?? null));
  }, []);

  const open = items.filter((i) => !i.checked);
  const total = estimatedTotal(items);

  const hour = new Date().getHours();
  const greeting = hour < 10 ? 'God morgen!' : hour < 17 ? 'God dag!' : 'God kveld!';
  const todayIso = isoDate(new Date());

  // Ukens middager: de neste planlagte, i dag først.
  const upcoming = useMemo(
    () => plan.filter((d) => d.meal_name && !d.skipped).slice(0, 3),
    [plan],
  );
  const plannedCount = plan.filter((d) => d.meal_name && !d.skipped).length;

  // «Ukentlige varer»: gjentaksvarer fra kvitteringene som mangler på listen.
  const repeats = useMemo(
    () => frequentMissing(catalog, existingNames),
    [catalog, existingNames],
  );

  const toRow = (c) => ({
    name: c.name,
    qty: 1,
    unit: guessUnit(c.name, c.major_category),
    category: c.major_category || 'Annet',
    store: c.primary_store || defaultStore,
    price: c.avg_price ?? null,
    price_source: c.avg_price ? 'receipt' : null,
  });

  // Kvoteregler som ligger etter denne uken — varselboksen fra designet.
  const behindRules = useMemo(
    () => ruleProgress(rules ?? [], plan, meals).filter((p) => p.rule.rule_type === 'min' && !p.met),
    [rules, plan, meals],
  );

  // Dagens middag — kveldens hovedsak øverst på Hjem.
  const tonight = plan.find((d) => d.plan_date === todayIso && d.meal_name && !d.skipped) ?? null;

  // Tilbud som treffer ukens planlagte ingredienser — forretningsideen i
  // én setning: «kjøttdeigen til torsdagens taco er på tilbud».
  const planOffers = useMemo(
    () => matchOffersToPlan(plan, meals, offers ?? []).slice(0, 3),
    [plan, meals, offers],
  );

  // --- «Kom i gang» for nye/tomme husholdninger -----------------------------
  const dismissKey = `pl.start.${household?.id ?? 'x'}`;
  const [startDismissed, setStartDismissed] = useState(() => {
    try { return localStorage.getItem(dismissKey) === '1'; } catch { return false; }
  });
  const steps = useMemo(() => [
    {
      key: 'porsjoner',
      label: 'Sett familiens porsjoner',
      sub: 'Hvor mange voksne og barn spiser til vanlig?',
      done: Boolean(household?.portions_set),
      go: 'middag',
    },
    {
      key: 'middag',
      label: 'Lagre deres første middag',
      sub: 'Hent en fra kokeboka, eller skriv inn familiefavoritten',
      done: meals.length > 0,
      go: 'kokebok',
    },
    {
      key: 'uke',
      label: 'Planlegg uka',
      sub: '«Foreslå ny ukemeny» fyller dagene på sekunder',
      done: plannedCount > 0,
      go: 'middag',
    },
    {
      key: 'send',
      label: 'Send ingrediensene til handlelisten',
      sub: 'Ett trykk fra middagsdagen — så er butikkturen klar',
      done: items.length > 0 || plan.some((d) => d.sent_to_list_at),
      go: 'middag',
    },
  ], [household, meals.length, plannedCount, items.length, plan]);
  const stepsDone = steps.filter((s) => s.done).length;
  const showStart = !startDismissed && stepsDone < steps.length;
  const dismissStart = () => {
    setStartDismissed(true);
    try { localStorage.setItem(dismissKey, '1'); } catch { /* ignorer */ }
  };

  const Tile = ({ value, label, warn }) => (
    <div style={{ background: 'var(--color-surface)', padding: '14px 16px' }}>
      <div className="tnum" style={{
        fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 27,
        letterSpacing: '-0.02em', lineHeight: 1.05,
        color: warn ? 'var(--color-accent)' : 'var(--color-text)',
      }}>
        {value}
      </div>
      <div className="text-muted" style={{
        fontSize: 10.5, marginTop: 4, textTransform: 'uppercase',
        letterSpacing: '.06em', fontWeight: 600,
      }}>{label}</div>
    </div>
  );

  return (
    <div>
      {/* ---------- Hilsen ---------- */}
      <div className="row-between" style={{ padding: 'var(--space-4) var(--space-4) 0', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 26, letterSpacing: '-0.015em' }}>{greeting}</h1>
          <p className="text-muted" style={{ fontSize: 13, margin: '4px 0 0' }}>{longDate()}</p>
        </div>
        {pointSum != null && pointSum !== 0 && (
          <span className="tag tag-honey" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
            <Star size={12} color="var(--color-honey)" fill="var(--color-honey)" aria-hidden="true" />
            {pointSum} poeng
          </span>
        )}
      </div>

      {/* ---------- Kom i gang (til alt er på plass) ---------- */}
      {showStart && (
        <div style={{ padding: 'var(--space-4) var(--space-4) 0' }}>
          <div style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-divider)',
            borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
          }}>
            <div className="row-between" style={{ padding: '12px 16px 0' }}>
              <div>
                <div className="card-kicker" style={{ marginBottom: 2 }}>Kom i gang</div>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17, letterSpacing: '-0.015em' }}>
                  {stepsDone} av {steps.length} på plass
                </div>
              </div>
              <button type="button" className="btn btn-icon btn-sm" onClick={dismissStart} aria-label="Skjul kom i gang">
                <X size={14} />
              </button>
            </div>
            <div style={{ padding: '10px 16px 14px' }}>
              {steps.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  disabled={s.done}
                  onClick={() => (s.go === 'kokebok' ? onGoInspiration() : onGo(s.go))}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%',
                    padding: '7px 0', background: 'none', border: 'none', textAlign: 'left',
                    cursor: s.done ? 'default' : 'pointer', font: 'inherit', color: 'inherit',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                      display: 'grid', placeItems: 'center',
                      background: s.done ? 'var(--color-herb)' : 'transparent',
                      border: s.done ? 'none' : '2px solid var(--color-divider-strong)',
                    }}
                  >
                    {s.done && <Check size={13} color="var(--color-surface)" />}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      display: 'block', fontSize: 14, fontWeight: 600,
                      textDecoration: s.done ? 'line-through' : 'none',
                      opacity: s.done ? 0.55 : 1,
                    }}>
                      {s.label}
                    </span>
                    {!s.done && (
                      <span className="text-muted" style={{ display: 'block', fontSize: 12, marginTop: 1 }}>{s.sub}</span>
                    )}
                  </span>
                  {!s.done && <ArrowRight size={14} style={{ flexShrink: 0, marginTop: 4, color: 'var(--color-accent)' }} />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---------- I kveld ---------- */}
      {tonight && (
        <div style={{ padding: 'var(--space-4) var(--space-4) 0' }}>
          <button
            type="button"
            onClick={() => onGo('middag')}
            style={{
              width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none',
              borderRadius: 'var(--radius-xl)', padding: '18px 20px',
              background: 'var(--color-text)', color: 'var(--color-surface)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <div className="row" style={{ gap: 13, alignItems: 'center' }}>
              <span style={{
                flexShrink: 0, width: 44, height: 44, borderRadius: 'var(--radius)',
                display: 'grid', placeItems: 'center',
                background: 'rgba(255,255,255,0.08)', color: 'var(--color-herb-300)',
              }}>
                <UtensilsCrossed size={22} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--color-herb-300)' }}>
                  I kveld
                </div>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 21, letterSpacing: '-0.02em', marginTop: 2 }}>
                  {tonight.meal_name}
                </div>
                {Number(tonight.guest_portions) > 0 && (
                  <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
                    +{tonight.guest_portions} gjesteporsjoner
                  </div>
                )}
              </div>
              <ArrowRight size={18} style={{ flexShrink: 0 }} />
            </div>
          </button>
        </div>
      )}

      {/* ---------- Fliser ---------- */}
      <div style={{ padding: 'var(--space-4)' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1,
          background: 'var(--color-divider-soft)',
          border: '1px solid var(--color-divider)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)',
        }}>
        <Tile value={open.length} label="Varer på listen" />
        <Tile
          value={total.sum > 0 ? Math.round(total.sum) : '—'}
          label={`Estimert total (kr)${total.exact || total.sum === 0 ? '' : ' · ca.'}`}
        />
        <Tile
          value={`${plannedCount} av ${plan.length || 7}`}
          label="Middager planlagt"
          warn={plan.length > 0 && plannedCount < plan.length}
        />
        <Tile value={repeats.length} label="Nye forslag" />
        </div>
      </div>

      {/* ---------- Handleliste i dag ---------- */}
      <div className="section-head">
        <span className="section-title">Handleliste – i dag</span>
        <span className="text-muted" style={{ fontSize: 11 }}>{open.length}</span>
      </div>
      {open.slice(0, 5).map((item) => (
        <div key={item.id} className="item-row">
          <input
            type="checkbox"
            className="checkbox"
            checked={false}
            onChange={() => onToggle(item)}
            aria-label={`Plukk ${item.name}`}
          />
          <div className="item-mid" style={{ cursor: 'default' }}>
            <div className="item-name">{item.name}</div>
            <div className="item-sub">
              {[item.category, item.store || defaultStore].filter(Boolean).join(' · ')}
            </div>
          </div>
          <Stepper
            item={item}
            onStep={(dir) => onStep(item, dir)}
            onOpen={() => onGo('handel')}
          />
        </div>
      ))}
      {open.length === 0 && (
        <p className="text-muted" style={{ padding: '0 var(--space-4) var(--space-2)', fontSize: 13 }}>
          Handlelisten er tom.
        </p>
      )}
      <div style={{ padding: 'var(--space-3) var(--space-4)' }}>
        <button type="button" className="btn btn-secondary btn-block" onClick={() => onGo('handel')}>
          {open.length > 5
            ? `Se resten av listen (${open.length - 5} ${open.length - 5 === 1 ? 'vare' : 'varer'} til)`
            : 'Åpne full handleliste'}
          <ArrowRight size={15} style={{ marginLeft: 'auto' }} />
        </button>
      </div>

      {/* ---------- Middager denne uken ---------- */}
      <hr className="divider" />
      <div className="section-head">
        <span className="section-title">Middager denne uken</span>
      </div>
      {upcoming.map((day) => {
        const meal = meals.find((m) => m.name === day.meal_name);
        const isToday = day.plan_date === todayIso;
        return (
          <button
            key={day.plan_date}
            type="button"
            className="item-row"
            onClick={() => onGo('middag')}
            style={{
              width: '100%', background: 'none', border: 'none', textAlign: 'left',
              borderBottom: '1px solid var(--color-divider-soft)', cursor: 'pointer',
            }}
          >
            <div className="item-mid">
              <div className="item-name">{day.meal_name}</div>
              <div className="item-sub">
                {day.reason ?? meal?.category ?? 'Planlagt'}
              </div>
            </div>
            <span className={`tag ${isToday ? 'tag-accent' : 'tag-outline'}`}>
              {dayLabel(day.plan_date)}
            </span>
          </button>
        );
      })}
      {upcoming.length === 0 && (
        <p className="text-muted" style={{ padding: '0 var(--space-4) var(--space-3)', fontSize: 13 }}>
          Ingen middager planlagt — la «Foreslå ny ukemeny» fylle uka.
        </p>
      )}

      {/* ---------- Tilbud som treffer ukens plan ---------- */}
      {planOffers.length > 0 && (
        <div style={{ padding: 'var(--space-3) var(--space-4) 0' }}>
          <div style={{
            border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-lg)',
            background: 'var(--color-surface)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
          }}>
            <div className="row" style={{ gap: 6, padding: '12px 16px 4px' }}>
              <Tag size={13} color="var(--color-accent)" aria-hidden="true" />
              <span style={{
                fontSize: 11, fontWeight: 600, letterSpacing: '.08em',
                textTransform: 'uppercase', color: 'var(--color-accent)',
              }}>
                Tilbud til ukens middager
              </span>
            </div>
            {planOffers.map(({ offer, mealName, planDate, pct }) => (
              <button
                key={offer.id}
                type="button"
                onClick={() => onGo('tilbud')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                  padding: '9px 16px', background: 'none', border: 'none',
                  textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit',
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{offer.product_name || offer.match_name || offer.name}</span>
                  <span className="text-muted" style={{ display: 'block', fontSize: 12, marginTop: 1 }}>
                    Til {mealName.toLowerCase()} {dayLabel(planDate).toLowerCase()}
                    {offer.store_name ? ` · ${offer.store_name}` : ''}
                  </span>
                </span>
                <span style={{ textAlign: 'right', flexShrink: 0 }}>
                  {Number(offer.price) > 0 && (
                    <span className="tnum" style={{ display: 'block', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, letterSpacing: '-0.01em' }}>{kr(offer.price)}</span>
                  )}
                  {pct > 0 && (
                    <span className="tnum" style={{ display: 'block', fontSize: 11, color: 'var(--color-accent)', fontWeight: 700 }}>
                      −{pct} %
                    </span>
                  )}
                </span>
              </button>
            ))}
            <div style={{ padding: '2px 16px 12px' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--color-accent)', fontWeight: 600, padding: 0 }}
                onClick={() => onGo('tilbud')}
              >
                Se alle tilbud <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Kokeboka ---------- */}
      <div style={{ padding: 'var(--space-3) var(--space-4) 0' }}>
        <button
          type="button"
          onClick={onGoInspiration}
          style={{
            width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none',
            borderRadius: 'var(--radius-lg)', padding: '16px 18px',
            background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-700, var(--color-accent)) 100%)',
            color: 'var(--color-text-inverse)', boxShadow: 'var(--shadow-md)',
          }}
        >
          <div className="row" style={{ gap: 12, alignItems: 'center' }}>
            <BookOpen size={26} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, letterSpacing: '-0.015em' }}>
                Kokeboka
              </div>
              <div style={{ fontSize: 12, opacity: 0.92, marginTop: 2 }}>
                {cookbookCount
                  ? `${cookbookCount} norske oppskrifter — og den vokser hver time.`
                  : 'Hent middagsinspirasjon fra norske kilder.'}
                {' '}Ingrediensene går rett til handlelisten.
              </div>
            </div>
            <ArrowRight size={18} style={{ flexShrink: 0 }} />
          </div>
        </button>
      </div>

      {/* ---------- Regelvarsel ---------- */}
      {behindRules.length > 0 && (
        <div style={{ padding: 'var(--space-3) var(--space-4) 0' }}>
          <div style={{ border: '1px solid var(--color-accent)', borderRadius: 'var(--radius)', background: 'var(--color-accent-100)', padding: '10px 14px' }}>
            <span style={{ fontSize: 13 }}>
              <strong>{behindRules[0].rule.scope}-regelen ligger etter denne uken</strong>
              {' '}— {behindRules[0].count} av {behindRules[0].target} planlagt.{' '}
              <button
                type="button"
                onClick={() => onGo('middag')}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
                  color: 'var(--color-accent)', cursor: 'pointer',
                }}
              >
                Planlegg i ukemenyen →
              </button>
            </span>
          </div>
        </div>
      )}

      {/* ---------- Smart forslag ---------- */}
      {repeats.length > 0 && (
        <div style={{ padding: 'var(--space-4)' }}>
          <div style={{ background: 'var(--color-bg-sunken)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)' }}>
            <div className="row" style={{ gap: 6, marginBottom: 6 }}>
              <Sparkles size={13} color="var(--color-accent)" />
              <span style={{
                fontSize: 11, fontWeight: 600, letterSpacing: '.08em',
                textTransform: 'uppercase', color: 'var(--color-accent)',
              }}>
                Smart forslag
              </span>
            </div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, letterSpacing: '-0.015em' }}>
              Ukentlige varer
            </div>
            <p style={{ fontSize: 13, margin: '6px 0 12px', color: 'var(--color-text)' }}>
              Basert på kjøpshistorikken deres. Mangler fra listen:
            </p>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 'var(--space-4)' }}>
              {repeats.slice(0, 8).map((c) => (
                <span key={c.name} className="tag" style={{ background: 'var(--color-surface)' }}>{c.name}</span>
              ))}
              {repeats.length > 8 && (
                <span className="tag tag-outline">+ {repeats.length - 8} flere gjentaksvarer</span>
              )}
            </div>
            <div className="row" style={{ gap: 12 }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setReview({
                  title: 'Ukentlige varer',
                  rows: repeats.map(toRow),
                })}
              >
                Legg alle til
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ color: 'var(--color-accent)', fontWeight: 600 }}
                onClick={() => onGo('forslag')}
              >
                Se alle forslag
              </button>
            </div>
          </div>
        </div>
      )}

      {review && (
        <ReviewDialog
          title={review.title}
          subtitle="Alt er avhuket — fjern det dere ikke trenger"
          rows={review.rows}
          existingNames={existingNames}
          onCancel={() => setReview(null)}
          onSubmit={async (rows) => { await onSendToList(rows); setReview(null); }}
        />
      )}
    </div>
  );
}
