import { estimatedTotal, dayLabel, isoDate } from '../lib/format.js';

export function Home({ household, members, items, todaysMeal, onGo }) {
  const total = estimatedTotal(items);
  const open = items.filter((i) => !i.checked);
  const hour = new Date().getHours();
  const greeting = hour < 10 ? 'God morgen' : hour < 17 ? 'Hei' : 'God kveld';

  return (
    <div style={{ padding: 'var(--space-4)' }}>
      <h1 style={{ fontSize: 22 }}>{greeting}!</h1>
      <p className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
        {household?.name}
        {members.length > 0 && ` · ${members.map((m) => m.display_name).join(' og ')}`}
      </p>

      <div className="card" style={{ marginTop: 'var(--space-4)' }}>
        <div className="card-kicker">Dagens middag · {dayLabel(isoDate(new Date()))}</div>
        <div className="card-title">{todaysMeal?.meal_name ?? 'Ikke planlagt'}</div>
        {todaysMeal?.reason && <div className="card-body">{todaysMeal.reason}</div>}
        <button
          type="button"
          className="btn btn-block"
          style={{ marginTop: 'var(--space-3)' }}
          onClick={() => onGo('middag')}
        >
          Åpne middagsplanen
        </button>
      </div>

      <div className="card" style={{ marginTop: 'var(--space-3)' }}>
        <div className="card-kicker">Neste handletur</div>
        <div className="card-title">
          {open.length} {open.length === 1 ? 'vare' : 'varer'} på listen
        </div>
        <div className="card-body">Estimert total: {total.label}</div>
        <button
          type="button"
          className="btn btn-primary btn-block"
          style={{ marginTop: 'var(--space-3)' }}
          onClick={() => onGo('handel')}
        >
          Åpne handlelisten
        </button>
      </div>
    </div>
  );
}
