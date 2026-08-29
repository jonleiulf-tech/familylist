import { useMemo, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { ReviewDialog } from '../components/ReviewDialog.jsx';
import { estimatedTotal, dayLabel, isoDate, longDate } from '../lib/format.js';
import { frequentMissing, guessUnit } from '../lib/catalog.js';

export function Home({
  household, items, onToggle, plan, meals, catalog,
  existingNames, defaultStore, onGo, onSendToList,
}) {
  const [review, setReview] = useState(null);

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

  const Tile = ({ value, label, warn }) => (
    <div style={{ background: 'var(--color-surface)', border: '2px solid var(--color-divider)', padding: '12px 14px' }}>
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
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
        padding: 'var(--space-4)',
      }}>
        <Tile value={open.length} label="Varer på listen" />
        <Tile
          value={total.sum > 0 ? Math.round(total.sum) : '—'}
          label={`Estimert total (kr)${total.exact || total.sum === 0 ? '' : ' · ca.'}`}
        />
        <Tile
          value={`${plannedCount}/${plan.length || 7}`}
          label="Middager planlagt"
          warn={plan.length > 0 && plannedCount < plan.length}
        />
        <Tile value={repeats.length} label="Gjentaksvarer mangler" />
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
        <button type="button" className="btn btn-block" onClick={() => onGo('handel')}>
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
                {dayLabel(day.plan_date)}{isToday ? ' · i dag' : ''}
              </div>
            </div>
            <span className={`tag ${isToday ? 'tag-accent' : 'tag-outline'}`}>
              {meal?.category ?? 'Planlagt'}
            </span>
          </button>
        );
      })}
      {upcoming.length === 0 && (
        <p className="text-muted" style={{ padding: '0 var(--space-4) var(--space-3)', fontSize: 13 }}>
          Ingen middager planlagt — la «Foreslå ny ukemeny» fylle uka.
        </p>
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
