import { Fragment, useEffect, useMemo, useRef } from 'react';
import { X, Check, Sparkles } from 'lucide-react';
import { sortShoppingItems } from '../lib/sortItems.js';
import { kr, estimatedTotal, qtyDetail, estimateCost } from '../lib/format.js';

/**
 * Butikkmodus: fullskjerm for selve handleturen, med én hånd på vogna.
 * Store trykkflater (hele raden), skjermen holdes våken, og varene står i
 * butikkens lærte plukk-rekkefølge. Avhuking gir et lite vibrasjonsdult.
 *
 * Alt her er tegnet for verste tilfelle: sollys på skjermen, støy rundt,
 * mobilen i én hånd og armlengdes avstand ned i vogna.
 */

// Én sammenhengende, varm palett i slekt med papiret: tomat, honning,
// urtegrønn, sand, terrakotta og oliven — ingen kalde blå/lilla toner.
// Hver kategori får sin tone hver tur, og et mettet fargebånd i
// venstrekanten som holder seg gjennom hele hylleblokka.
//
// Radfargen blandes ut fra båndfargen med color-mix i stedet for å skrives
// som hex: da er den bygget av tokens, og den snur riktig vei av seg selv i
// mørk modus (flaten blir mørk, teksten lys). Blandingsprosenten er satt
// per farge — de dype fargene tåler mindre før raden blir for tung.
// Tonene er bevisst litt dypere enn en pastell: en vask som forsvinner i
// sollys hjelper ingen ved hylla.
const ROW_STYLES = [
  { rail: 'var(--color-accent-400)', mix: 20 },
  { rail: 'var(--color-honey-400)', mix: 22 },
  { rail: 'var(--color-herb-400)', mix: 20 },
  { rail: 'var(--color-honey-600)', mix: 14 },
  { rail: 'var(--color-accent-600)', mix: 12 },
  { rail: 'var(--color-herb-600)', mix: 15 },
];

const hashIndex = (category) => {
  const s = String(category ?? 'Annet');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 997;
  return h % ROW_STYLES.length;
};

/** Annenhver rad i samme hylleblokk tones et hakk dypere. */
const rowBg = (style, i) =>
  `color-mix(in srgb, ${style.rail} ${i % 2 === 0 ? style.mix : style.mix + 9}%, var(--color-surface))`;

/** Hårstrek som virker både på lys og mørk radflate. */
const HAIRLINE = 'color-mix(in srgb, var(--color-text) 14%, transparent)';

/** Småtekst under varenavnet: mengdeforklaring og prisanslag. */
const detailBits = (item) => [
  qtyDetail(item.qty, item.unit, item.pack_size),
  item.price && estimateCost(item) > 0 ? `ca. ${kr(Math.round(estimateCost(item)))}` : null,
].filter(Boolean);

export function ShopMode({
  items, stores, activeStore, onPickStore,
  positionOf, hasLearnedFor, defaultStore,
  onToggle, onComplete, onClose,
}) {
  const open = items.filter((i) => !i.checked);
  const picked = items.filter((i) => i.checked);
  const total = estimatedTotal(items);
  const done = items.length ? Math.round((picked.length / items.length) * 100) : 0;

  const groups = useMemo(
    () => sortShoppingItems(open, 'plukk', { positionOf, defaultStore, currentStore: activeStore }),
    [open, positionOf, defaultStore, activeStore],
  );

  // Rekkefølgen er alt sortert etter hylleplassering — her deles den bare
  // opp i synlige hylleblokker, slik at man ser HVOR i butikken man er.
  // Ingen omsortering: blokkene følger rekkefølgen radene alt har.
  const blocked = useMemo(() => groups.map((g) => {
    const blocks = [];
    let prev = -1;
    for (const item of g.rows) {
      const category = item.category || 'Annet';
      const last = blocks[blocks.length - 1];
      if (last && last.category === category) { last.items.push(item); continue; }
      // Fargen henger på kategorinavnet, så den samme varetypen ser lik ut
      // fra tur til tur. Lander to nabo-blokker likevel på samme tone,
      // dyttes den ene ett hakk — to like blokker etter hverandre er verre
      // enn at én kategori bytter tone.
      let idx = hashIndex(category);
      if (idx === prev) idx = (idx + 1) % ROW_STYLES.length;
      prev = idx;
      blocks.push({ category, style: ROW_STYLES[idx], items: [item] });
    }
    return { ...g, blocks };
  }), [groups]);

  // Skjermen skal ikke slukne midt mellom hyllene. Wake lock slippes av
  // nettleseren ved fanebytte, så vi ber om den igjen når appen er tilbake.
  const lockRef = useRef(null);
  useEffect(() => {
    let alive = true;
    const acquire = async () => {
      try {
        if (alive && document.visibilityState === 'visible') {
          lockRef.current = await navigator.wakeLock?.request('screen');
        }
      } catch { /* lav batteristatus o.l. — modusen virker uansett */ }
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', acquire);
      lockRef.current?.release?.().catch(() => {});
    };
  }, []);

  const pick = (item) => {
    navigator.vibrate?.(12);
    onToggle(item);
  };

  return (
    <div
      role="dialog"
      aria-label="Butikkmodus"
      style={{
        position: 'fixed', inset: 0, zIndex: 80,
        background: 'var(--color-bg)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Topp: hvor mye gjenstår, butikkvelger, lukk */}
      <div style={{
        padding: '10px var(--space-4) 9px',
        borderBottom: '1px solid var(--color-divider-strong)',
        background: 'var(--color-surface)', boxShadow: 'var(--shadow-sm)',
      }}>
        <div className="row-between" style={{ alignItems: 'flex-start', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div className="card-kicker" style={{ marginBottom: 1 }}>Butikkmodus</div>
            <div className="tnum" style={{
              fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26,
              letterSpacing: '-0.02em', lineHeight: 1.05, color: 'var(--color-text)',
            }}>
              {items.length === 0 ? 'Tom liste' : open.length === 0
                ? 'Alt plukket!'
                : <>{open.length}<span style={{ fontSize: 17, fontWeight: 700 }}> igjen</span></>}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-icon"
            style={{ minWidth: 44, minHeight: 44, flexShrink: 0 }}
            onClick={onClose}
            aria-label="Avslutt butikkmodus"
          >
            <X size={20} />
          </button>
        </div>

        {/* Fremdrift: hvor langt er vi? Ett blikk skal holde. */}
        <div className="row-between" style={{ gap: 10, marginTop: 6, marginBottom: 5 }}>
          <div style={{
            flex: 1, height: 9, background: 'var(--color-bg-sunken)',
            borderRadius: 'var(--radius-full)', overflow: 'hidden',
            boxShadow: 'inset 0 1px 2px rgba(74, 54, 38, 0.12)',
          }}>
            <div style={{
              width: `${done}%`, height: '100%', background: 'var(--color-herb)',
              borderRadius: 'var(--radius-full)',
              transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            }} />
          </div>
          <span className="tnum" style={{ fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
            {picked.length}/{items.length}
            {total.sum > 0 && (
              <span className="text-muted" style={{ fontWeight: 600 }}> · ca. {kr(Math.round(total.sum))}</span>
            )}
          </span>
        </div>

        <div className="row" style={{ gap: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
          {stores.map((st) => (
            <button
              key={st.code}
              type="button"
              className={`tag tag-button ${activeStore === st.name ? 'tag-accent' : 'tag-outline'}`}
              style={{ flexShrink: 0, minHeight: 38, padding: '0 15px', fontSize: 13 }}
              onClick={() => onPickStore(st.name)}
              aria-pressed={activeStore === st.name}
            >
              {st.name}
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 5, marginTop: 5 }}>
          <Sparkles size={12} color={hasLearnedFor(activeStore) ? 'var(--color-herb)' : 'var(--color-honey)'} aria-hidden="true" />
          <span className="text-muted" style={{ fontSize: 11.5 }}>
            {hasLearnedFor(activeStore)
              ? `Sortert i ruta deres på ${activeStore}`
              : `Fullfør en tur på ${activeStore}, så lærer lista ruta deres`}
          </span>
        </div>
      </div>

      {/* Selve lista — store trykkflater, hele raden huker av */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {blocked.map(({ key, label, blocks }) => (
          <section key={key}>
            {label && blocked.length > 1 && (
              <div className="section-head" style={{ paddingTop: 14, paddingBottom: 4, alignItems: 'center' }}>
                <span className="section-title" style={{ fontSize: 17 }}>{label}</span>
                <span className="text-muted tnum" style={{ fontSize: 12, fontWeight: 600 }}>
                  {blocks.reduce((n, b) => n + b.items.length, 0)} igjen
                </span>
              </div>
            )}
            {blocks.map((block, bi) => (
              <Fragment key={`${block.category}-${bi}`}>
                {/* Hylleblokk-overskrift: klistrer seg øverst mens man ruller,
                    så man alltid vet hvilken del av butikken radene hører til. */}
                <div style={{
                  position: 'sticky', top: 0, zIndex: 1,
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px var(--space-4)',
                  background: 'var(--color-bg-sunken)',
                  borderTop: '1px solid var(--color-divider-strong)',
                  borderBottom: '1px solid var(--color-divider-strong)',
                }}>
                  <span aria-hidden="true" style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: block.style.rail, flexShrink: 0,
                  }} />
                  <span style={{
                    fontSize: 11.5, fontWeight: 800, letterSpacing: '.08em',
                    textTransform: 'uppercase', color: 'var(--color-text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {block.category}
                  </span>
                  <span className="text-muted tnum" style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700 }}>
                    {block.items.length}
                  </span>
                </div>
                {block.items.map((item, i) => {
                  const bits = detailBits(item);
                  return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => pick(item)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 13, width: '100%',
                      minHeight: 68, padding: '11px var(--space-4)',
                      background: rowBg(block.style, i),
                      border: 'none',
                      borderLeft: `6px solid ${block.style.rail}`,
                      borderBottom: `1px solid ${HAIRLINE}`,
                      textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'var(--color-text)',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                        background: 'var(--color-surface)',
                        border: '2.5px solid var(--color-text-muted)',
                        boxShadow: 'inset 0 1px 2px rgba(74, 54, 38, 0.10)',
                      }}
                    />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 19, fontWeight: 600, lineHeight: 1.2 }}>
                        {item.name}
                      </span>
                      {(Boolean(item.is_offer) || bits.length > 0) && (
                        <span style={{ display: 'block', fontSize: 13, marginTop: 3, lineHeight: 1.3 }}>
                          {Boolean(item.is_offer) && (
                            <span style={{ fontWeight: 800, color: 'var(--color-accent-700)' }}>
                              TILBUD{bits.length ? ' · ' : ''}
                            </span>
                          )}
                          {bits.length > 0 && (
                            <span style={{ color: 'var(--color-text)', opacity: 0.72 }}>
                              {bits.join(' · ')}
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                    {/* Mengden som egen tydelig pille — det man faktisk skal se ved hylla */}
                    <span className="tnum" style={{
                      flexShrink: 0, background: 'var(--color-surface)',
                      border: '1.5px solid var(--color-divider-strong)', borderRadius: 'var(--radius-full)',
                      padding: '8px 14px', minWidth: 62, textAlign: 'center',
                      whiteSpace: 'nowrap', color: 'var(--color-text)',
                      fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 19,
                      letterSpacing: '-0.01em', lineHeight: 1.1, boxShadow: 'var(--shadow-sm)',
                    }}>
                      {item.qty} {item.unit}
                    </span>
                  </button>
                  );
                })}
              </Fragment>
            ))}
          </section>
        ))}

        {/* Det lille seiersøyeblikket: alt er i vogna. */}
        {open.length === 0 && (
          <div style={{ padding: 'var(--space-6) var(--space-4) var(--space-5)', textAlign: 'center' }}>
            <span
              aria-hidden="true"
              style={{
                display: 'grid', placeItems: 'center', width: 68, height: 68, margin: '0 auto',
                borderRadius: '50%', background: 'var(--color-herb)',
                boxShadow: '0 6px 18px rgba(47, 112, 72, 0.28)',
              }}
            >
              <Check size={36} color="var(--color-text-inverse)" strokeWidth={2.6} />
            </span>
            <h2 style={{ fontSize: 26, marginTop: 'var(--space-4)', letterSpacing: '-0.02em' }}>
              {picked.length ? 'Alt er plukket!' : 'Ingenting på lista'}
            </h2>
            <p className="tnum" style={{ fontSize: 14, marginTop: 8, marginBottom: 0, color: 'var(--color-text-muted)' }}>
              {picked.length
                ? <>
                    {picked.length} {picked.length === 1 ? 'vare' : 'varer'} i vogna
                    {total.sum > 0 ? ` · ${total.label}` : ''}. Fullfør turen under —
                    {' '}da lærer lista ruta deres til neste gang.
                  </>
                : 'Legg til varer på handlelisten, så står de klare her.'}
            </p>
          </div>
        )}

        {/* Plukket: skal tre i bakgrunnen, men fortsatt være til å lese og angre */}
        {picked.length > 0 && (
          <section style={{ paddingBottom: 96, background: 'var(--color-bg-sunken)' }}>
            <div className="section-head" style={{ paddingTop: 14, paddingBottom: 4, alignItems: 'center' }}>
              <span className="section-title" style={{ fontSize: 15, color: 'var(--color-text-muted)' }}>Plukket</span>
              <span className="text-muted tnum" style={{ fontSize: 12, fontWeight: 600 }}>
                {picked.length} · trykk for å angre
              </span>
            </div>
            {picked.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => pick(item)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 13, width: '100%',
                  minHeight: 52, padding: '8px var(--space-4)',
                  background: 'none', border: 'none',
                  borderBottom: '1px solid var(--color-divider)',
                  textAlign: 'left', cursor: 'pointer', font: 'inherit',
                  color: 'var(--color-text-muted)',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--color-herb)', display: 'grid', placeItems: 'center',
                  }}
                >
                  <Check size={17} color="var(--color-text-inverse)" strokeWidth={3} />
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 16, textDecoration: 'line-through' }}>
                  {item.name}
                </span>
                <span className="tnum" style={{ flexShrink: 0, fontSize: 13, textDecoration: 'line-through' }}>
                  {item.qty} {item.unit}
                </span>
              </button>
            ))}
          </section>
        )}
      </div>

      {/* Bunn: fullfør */}
      <div style={{
        padding: '10px var(--space-4) calc(12px + env(safe-area-inset-bottom))',
        borderTop: '1px solid var(--color-divider-strong)', background: 'var(--color-surface)',
        boxShadow: '0 -2px 12px rgba(74, 54, 38, 0.08)',
      }}>
        <button
          type="button"
          className="btn btn-primary btn-block"
          style={{ minHeight: 56, fontSize: 17 }}
          disabled={!picked.length}
          onClick={onComplete}
        >
          <Check size={19} /> Fullfør handletur ({picked.length} plukket)
        </button>
      </div>
    </div>
  );
}
