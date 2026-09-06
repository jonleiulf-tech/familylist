import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { registerLeaveGuard } from '../lib/router.jsx';

/* Små byggeklosser for /admin. Ingen data her, bare grensesnitt. */

/* ---------- Toast ---------- */
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((message, kind = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} role="status" className={`toast${t.kind === 'error' ? ' toast--error' : ''}`}>{t.message}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ---------- Bekreft (erstatter window.confirm) ---------- */
const ConfirmCtx = createContext(async () => false);
export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null);
  const ref = useRef();
  const confirm = useCallback((opts) => new Promise((resolve) => setReq({ ...(typeof opts === 'string' ? { title: opts } : opts), resolve })), []);
  useEffect(() => { if (req && ref.current && !ref.current.open) ref.current.showModal(); }, [req]);
  const done = (v) => { req?.resolve(v); ref.current?.close(); setReq(null); };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {req && (
        <dialog ref={ref} className="dialog" onClose={() => done(false)} onClick={(e) => { if (e.target === ref.current) done(false); }}>
          <div className="dialog__body">
            <h3>{req.title}</h3>
            {req.body && <p className="muted">{req.body}</p>}
            <div className="dialog__actions">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => done(false)} autoFocus>{req.cancel || 'Avbryt'}</button>
              <button type="button" className={`btn btn--sm ${req.danger ? 'btn--danger' : 'btn--primary'}`} onClick={() => done(true)}>{req.ok || 'OK'}</button>
            </div>
          </div>
        </dialog>
      )}
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmCtx);

/* ---------- Layout ---------- */
export function PageTitle({ eyebrow, title, intro, actions, children }) {
  return (
    <header className="adm__head">
      <div className="adm__head-text">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {intro && <p className="muted">{intro}</p>}
        {children}
      </div>
      {actions && <div className="adm__head-actions">{actions}</div>}
    </header>
  );
}

export function Panel({ title, intro, actions, children, className = '', pad = true }) {
  return (
    <section className={`panel${pad ? '' : ' panel--flush'} ${className}`}>
      {(title || actions) && (
        <div className="panel__head">
          <div>{title && <h2>{title}</h2>}{intro && <p className="muted">{intro}</p>}</div>
          {actions && <div className="panel__actions">{actions}</div>}
        </div>
      )}
      <div className="panel__body">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, to, onClick }) {
  const inner = <><strong>{value}</strong><span>{label}</span>{hint && <small>{hint}</small>}</>;
  if (onClick) return <button type="button" className="stat stat--link" onClick={onClick}>{inner}</button>;
  return <div className="stat">{inner}</div>;
}

export function Tabs({ tabs, active, onChange, ariaLabel = 'Faner' }) {
  return (
    <div className="tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map(([key, label, badge]) => (
        <button key={key} role="tab" type="button" aria-selected={active === key} className={active === key ? 'is-active' : ''} onClick={() => onChange(key)}>
          {label}{badge != null && badge !== 0 && <span className="tabs__badge">{badge}</span>}
        </button>
      ))}
    </div>
  );
}

export function StatusPill({ status }) {
  const map = {
    published: ['Publisert', 'pill--teal'], draft: ['Utkast', 'pill--warn'], cancelled: ['Avlyst', 'pill--danger'],
    active: ['Aktiv', 'pill--teal'], inactive: ['Skjult', ''], ok: ['OK', 'pill--teal'], missing: ['Mangler', 'pill--warn'],
  };
  const [label, cls] = map[status] || [status, ''];
  return <span className={`pill ${cls}`}>{label}</span>;
}

export function Empty({ title, body, action }) {
  return (
    <div className="empty">
      <p><strong>{title}</strong></p>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}

export function Loading({ text = 'Laster …' }) {
  return <p className="muted adm__loading">{text}</p>;
}

/* ---------- Lagre-linje som dukker opp når noe er endret ---------- */
export function SaveBar({ dirty, busy, onSave, onReset, extra, label = 'Lagre endringer' }) {
  useEffect(() => {
    if (!dirty) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    // Og det samme innenfor siden: bytter man fane i adminmenyen uten
    // å lagre, var endringene bare borte.
    const slipp = registerLeaveGuard(() => 'Du har endringer som ikke er lagret. Vil du forlate siden likevel?');
    return () => { window.removeEventListener('beforeunload', h); slipp(); };
  }, [dirty]);
  return (
    <div className={`savebar${dirty ? ' is-visible' : ''}`} aria-hidden={!dirty}>
      <span className="savebar__text">Du har endringer som ikke er lagret.</span>
      <div className="savebar__actions">
        {extra}
        {onReset && <button type="button" className="btn btn--ghost btn--sm" onClick={onReset} disabled={busy}>Forkast</button>}
        <button type="button" className="btn btn--primary btn--sm" onClick={onSave} disabled={busy || !dirty}>{busy ? 'Lagrer …' : label}</button>
      </div>
    </div>
  );
}

/* Utkast med sporing av endringer. reset(nytt) når data lastes på nytt. */
const SKIP = new Set(['updated_at', 'updated_by', 'created_at', 'created_by']);
export const snapshot = (v) => JSON.stringify(v, (k, val) => (SKIP.has(k) ? undefined : val === undefined ? null : val));
export function useDraft(initial) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  useEffect(() => { setSaved(initial); setDraft(initial); }, [initial]);
  const dirty = snapshot(saved) !== snapshot(draft);
  return { draft, setDraft, dirty, reset: () => setDraft(saved), markSaved: (v = draft) => { setSaved(v); setDraft(v); } };
}

/* Meny med handlinger (⋯) */
export function Menu({ items, label = 'Flere valg' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', h);
    return () => document.removeEventListener('pointerdown', h);
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button type="button" className="btn btn--ghost btn--sm menu__btn" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}>⋯</button>
      {open && (
        <div className="menu__list" role="menu">
          {items.filter(Boolean).map(([text, fn, danger]) => (
            <button key={text} type="button" role="menuitem" className={danger ? 'is-danger' : ''} onClick={() => { setOpen(false); fn(); }}>{text}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Kbd({ children }) { return <kbd className="kbd">{children}</kbd>; }

export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
export const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString('nb-NO', { timeZone: 'Europe/Oslo', weekday: 'short', day: 'numeric', month: 'short' }) : '');
export const relTime = (iso) => {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diff < 1) return 'nå';
  if (diff < 60) return `${Math.round(diff)} min siden`;
  if (diff < 60 * 24) return `${Math.round(diff / 60)} t siden`;
  if (diff < 60 * 24 * 14) return `${Math.round(diff / 1440)} d siden`;
  return new Date(iso).toLocaleDateString('nb-NO');
};
export const nb = (x) => (x && typeof x === 'object' ? x.nb || x.en || '' : x || '');
