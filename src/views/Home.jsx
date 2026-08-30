import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Sparkles, BookOpen } from 'lucide-react';
import { ReviewDialog } from '../components/ReviewDialog.jsx';
import { supabase } from '../lib/supabase.js';
import { estimatedTotal, dayLabel, isoDate, longDate } from '../lib/format.js';
import { frequentMissing, guessUnit } from '../lib/catalog.js';
import { ruleProgress } from '../lib/rulesInsights.js';

export function Home({
  household, items, onToggle, plan, meals, catalog, rules,
  existingNames, defaultStore, onGo, onGoInspiration, onSendToList,
}) {
  const [review, setReview] = useState(null);

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

  const Tile = ({ value, label, warn }) => (
    <div style={{ background: 'var(--color-surface)', padding: '12px 14px' }}>
      <div style={{
        fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24,
        letterSpacing: '-0.02em', lineHeight: 1.1,
        color: warn ? 'var(--color-accent)' : 'var(--color-text)',
      }}>
        {value}
      </div>
      <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <div>
      {/* ---------- Hilsen ---------- */}
      <div style={{ padding: 'var(--space-4) var(--space-4) 0' }}>
        <h1 style={{ fontSize: 24 }}>{greeting}</h1>
        <p className="text-muted" style={{ fontSize: 13, margin: '4px 0 0' }}>{longDate()}</p>
      </div>

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
          <span className="text-muted" style={{ fontSize: 12, flexShrink: 0 }}>
            {item.qty} {item.unit}
          </span>
        </div>
      ))}
      {open.length === 0 && (
        <p className="text-muted" style={{ padding: '0 var(--space-4) var(--space-2)', fontSize: 13 }}>
          Handlelisten er tom.
        </p>
      )}
      <div style={{ padding: 'var(--space-3) var(--space-4)' }}>
        <button type="button" className="btn btn-secondary btn-block" onClick={() => onGo('handel')}>
          Åpne full handleliste <ArrowRight size={15} style={{ marginLeft: 'auto' }} />
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

      {/* ---------- Kokeboka ---------- */}
      <div style={{ padding: 'var(--space-3) var(--space-4) 0' }}>
        <button
          type="button"
          onClick={onGoInspiration}
          style={{
            width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none',
            borderRadius: 'var(--radius-lg)', padding: '16px 18px',
            background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-700, var(--color-accent)) 100%)',
            color: '#fff', boxShadow: 'var(--shadow-sm)',
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
          <div style={{ background: 'var(--color-bg-sunken)', padding: 'var(--space-4)' }}>
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
