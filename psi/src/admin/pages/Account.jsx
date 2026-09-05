import { PageTitle, Panel } from '../ui.jsx';
import { SetPassword } from './SignIn.jsx';
import { ROLES } from '../access.js';

export default function Account({ me, access, data, auth }) {
  const mine = data.members.filter((m) => m.email === me);
  return (
    <>
      <PageTitle eyebrow="Konto" title="Min konto" intro={`Logget inn som ${me}.`} />
      <div className="adm__cols">
        <Panel title="Mine roller">
          {mine.length === 0 && <p className="muted">Ingen roller registrert.</p>}
          <ul className="list">
            {mine.map((m) => (
              <li key={m.id}>
                <div><strong>{ROLES[m.role]?.label || m.role}</strong>{m.sport_slug && <span className="muted"> · {data.sports.find((s) => s.slug === m.sport_slug)?.name || m.sport_slug}</span>}</div>
                <div className="muted">{ROLES[m.role]?.desc}</div>
                {m.title && <div className="muted">Vises som: {m.name || me}, {m.title}{m.show_public ? '' : ' (skjult på nettsiden)'}</div>}
              </li>
            ))}
          </ul>
          <p className="hint muted">Navn og tittel endres under Tilgang{access.isAdmin ? '' : ' av PSI-admin, eller av deg selv på din egen rad'}.</p>
        </Panel>
        <div className="stack">
          <SetPassword auth={auth} />
          <Panel title="Innlogging">
            <p className="muted">Du kan alltid logge inn med lenke på e-post, også om du glemmer passordet. Lenken virker i én time.</p>
            <button type="button" className="btn btn--ghost btn--sm" onClick={auth.signOut}>Logg ut</button>
          </Panel>
        </div>
      </div>
    </>
  );
}
