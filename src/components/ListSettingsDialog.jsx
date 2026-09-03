import { useState } from 'react';
import { Dialog } from './Dialog.jsx';
import { KIND_LABEL } from './ListSwitcher.jsx';

/** Hvor mange ekstra butikker husholdningen gidder (households.max_extra_stores). */
const EKSTRA_BUTIKKER = [
  ['0', 'Ingen — alt på én butikk'],
  ['1', 'Én ekstra, når det lønner seg'],
  ['2', 'Opptil to ekstra'],
  ['3', 'Opptil tre ekstra'],
];

/** Hvor mye bekvemmelighet veier mot pris (households.convenience_weight). */
const BEKVEMMELIGHET = [
  ['0.5', 'Pris er viktigst'],
  ['1', 'Vanlig'],
  ['1.5', 'Helst få butikker'],
  ['2', 'Bare når det virkelig lønner seg'],
];

const klamp = (v, lo, hi, fallback) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
};

/**
 * Innstillinger for den aktive delte listen: navn, type, for familielister
 * antall voksne og barn — middagsmengdene bygger på det — og
 * handleinnstillingene «Del opp handelen?» bruker: hvor mange ekstra
 * butikker dere gidder, og hva en ekstra butikk minst må spare.
 * Bare admin kan lagre; RLS håndhever det uansett hva UI-et viser.
 */
export function ListSettingsDialog({ list, isOwner, onClose, onSave }) {
  const [name, setName] = useState(list.name ?? '');
  const [kind, setKind] = useState(list.kind ?? 'annet');
  const [adults, setAdults] = useState(String(list.adults ?? 2));
  const [children, setChildren] = useState(String(list.children ?? 2));
  const [maxExtra, setMaxExtra] = useState(String(list.max_extra_stores ?? 1));
  const [minKr, setMinKr] = useState(String(list.min_saving_extra_store ?? 60));
  const [minPct, setMinPct] = useState(String(list.min_saving_pct ?? 5));
  const [weight, setWeight] = useState(String(Number(list.convenience_weight ?? 1)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const patch = { name: name.trim(), kind };
      if (kind === 'familie') {
        patch.adults = Math.max(1, Math.min(10, Number(adults) || 2));
        patch.children = Math.max(0, Math.min(10, Number(children) || 0));
      }
      // Handleinnstillingene sendes bare når de er endret — da virker
      // dialogen også mot en base der fase 3-migrasjonen ikke er kjørt ennå.
      const handel = {
        max_extra_stores: klamp(maxExtra, 0, 3, 1),
        min_saving_extra_store: klamp(minKr, 0, 5000, 60),
        min_saving_pct: klamp(minPct, 0, 100, 5),
        convenience_weight: klamp(weight, 0, 5, 1),
      };
      for (const [k, v] of Object.entries(handel)) {
        const før = list[k] ?? { max_extra_stores: 1, min_saving_extra_store: 60, min_saving_pct: 5, convenience_weight: 1 }[k];
        if (Number(før) !== v) patch[k] = v;
      }
      const err = await onSave(list.id, patch);
      if (err) { setError(err); return; }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Listeinnstillinger"
      subtitle={isOwner ? undefined : 'Bare admin kan endre disse'}
      onClose={onClose}
      footer={isOwner ? (
        <button type="submit" form="list-settings" className="btn btn-primary btn-block" disabled={busy || !name.trim()}>
          {busy ? 'Lagrer …' : 'Lagre'}
        </button>
      ) : null}
    >
      <form id="list-settings" onSubmit={save}>
        <label className="field">
          <span className="field-label">Navn</span>
          <input
            className="input" required disabled={!isOwner}
            value={name} onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field-label">Type</span>
          <select className="input" disabled={!isOwner} value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>

        {kind === 'familie' && (
          <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
            <label className="field" style={{ flex: 1 }}>
              <span className="field-label">Spiser som voksen</span>
              <input
                className="input" inputMode="numeric" disabled={!isOwner}
                value={adults} onChange={(e) => setAdults(e.target.value)}
              />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span className="field-label">Spiser mindre (barn)</span>
              <input
                className="input" inputMode="numeric" disabled={!isOwner}
                value={children} onChange={(e) => setChildren(e.target.value)}
              />
            </label>
          </div>
        )}

        {kind === 'familie' && (
          <p className="text-muted" style={{ fontSize: 11, marginTop: 0 }}>
            Samme profil som «Familie og porsjoner» på Middag-fanen: alle som
            spiser som en voksen teller 1 porsjon, barn som spiser mindre en
            halv. Oppskrifter fra kokeboka skaleres automatisk til dette.
          </p>
        )}

        <hr className="divider" style={{ height: 1, background: 'var(--color-divider-soft)', margin: '8px 0 10px' }} />
        <div className="card-kicker" style={{ marginBottom: 6 }}>Butikker og besparelse</div>

        <label className="field">
          <span className="field-label">Ekstra butikker dere gidder</span>
          <select className="input" disabled={!isOwner} value={maxExtra} onChange={(e) => setMaxExtra(e.target.value)}>
            {EKSTRA_BUTIKKER.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>

        <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: 1 }}>
            <span className="field-label">Må spare minst (kr)</span>
            <input
              className="input" inputMode="numeric" disabled={!isOwner}
              value={minKr} onChange={(e) => setMinKr(e.target.value)}
            />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span className="field-label">… og minst (% av handelen)</span>
            <input
              className="input" inputMode="numeric" disabled={!isOwner}
              value={minPct} onChange={(e) => setMinPct(e.target.value)}
            />
          </label>
        </div>

        <label className="field">
          <span className="field-label">Hva veier mest</span>
          <select className="input" disabled={!isOwner} value={weight} onChange={(e) => setWeight(e.target.value)}>
            {BEKVEMMELIGHET.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>

        <p className="text-muted" style={{ fontSize: 11, marginTop: 0 }}>
          Styrer «Del opp handelen?» på Handel-fanen. En ekstra butikk koster
          tid og kjøring selv uten gebyr, så den foreslås bare når den sparer
          minst dette — per ekstra butikk. Aldri «tre butikker for 103 kr».
        </p>

        {error && (
          <p style={{ fontSize: 12, color: 'var(--color-accent)' }}>{error}</p>
        )}
      </form>
    </Dialog>
  );
}
