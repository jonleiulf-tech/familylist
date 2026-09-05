import { useEffect } from 'react';
import { hasBackend } from '../lib/supabase.js';
import { useRouter, Link } from '../lib/router.jsx';
import { useContent } from '../lib/content.jsx';
import { useAdminAuth } from './useAdminAuth.js';
import { PageHead } from '../components/Bits.jsx';
import SetupCheck from './SetupCheck.jsx';
import { ToastProvider, ConfirmProvider, Loading } from './ui.jsx';
import { AdminDataProvider, useAdminData } from './api.jsx';
import SignIn, { SetPassword } from './pages/SignIn.jsx';
import Overview from './pages/Overview.jsx';
import Group from './pages/Group.jsx';
import NewsList, { NewsEditor } from './pages/News.jsx';
import Calendar, { EventEditor } from './pages/Calendar.jsx';
import Media from './pages/Media.jsx';
import Partners from './pages/Partners.jsx';
import Settings from './pages/Settings.jsx';
import Access from './pages/Access.jsx';
import Account from './pages/Account.jsx';

/* /admin: arbeidsflaten for styret og gruppelederne. Norsk grensesnitt.
   Underadresser: /admin/grupper/<slug>/<fane>, /admin/nyheter/<id|ny>,
   /admin/kalender/<id|ny>, /admin/bilder, /admin/partnere,
   /admin/innstillinger, /admin/tilgang, /admin/konto */

export default function Admin() {
  if (!hasBackend) {
    return (
      <>
        <PageHead eyebrow="For styret" title="Admin er ikke slått på" />
        <section className="section"><div className="wrap prose">
          <p>Siden kjører nå på innholdet i <code>src/data/psi.js</code>. Det er helt fint: endringer gjøres i den fila og publiseres via GitHub.</p>
          <p>Vil styret heller redigere i et skjema her, følg «Admin» i <code>SETUP.md</code>: opprett et Supabase-prosjekt, kjør <code>supabase/migrations/0001_grunnlag.sql</code> og <code>supabase/migrations/0002_roller_innhold.sql</code>, og legg inn to miljøvariabler i Vercel.</p>
        </div></section>
        <section className="section" style={{ paddingTop: 0 }}><div className="wrap" style={{ maxWidth: 640 }}><SetupCheck /></div></section>
      </>
    );
  }
  return (
    <ToastProvider><ConfirmProvider>
      <Gate />
    </ConfirmProvider></ToastProvider>
  );
}

function Gate() {
  const auth = useAdminAuth();
  if (auth.loading) return <section className="section"><div className="wrap"><Loading /></div></section>;
  if (auth.session && auth.måSettePassord) {
    return (
      <>
        <PageHead eyebrow="For styret" title="Velg nytt passord" intro={`For ${auth.session.user.email}.`} />
        <section className="section"><div className="wrap" style={{ maxWidth: 480 }}>
          <SetPassword auth={auth} onDone={auth.ferdigMedPassord} title="Nytt passord" />
        </div></section>
      </>
    );
  }
  if (!auth.session) return <SignIn auth={auth} />;
  return <AdminDataProvider><Workspace auth={auth} /></AdminDataProvider>;
}

/* ---------- Sti → side ---------- */
function route(path) {
  const parts = path.replace(/^\/admin\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [a, b, c] = parts;
  if (!a) return { page: 'overview' };
  if (a === 'grupper' && b) return { page: 'group', slug: b, tab: c || 'info' };
  if (a === 'grupper') return { page: 'overview' };
  if (a === 'nyheter') return b ? { page: 'news-edit', id: b } : { page: 'news' };
  if (a === 'kalender') return b ? { page: 'event-edit', id: b } : { page: 'calendar' };
  if (a === 'bilder') return { page: 'media', slug: b || null };
  if (a === 'partnere') return { page: 'partners' };
  if (a === 'innstillinger') return { page: 'settings' };
  if (a === 'tilgang') return { page: 'access' };
  if (a === 'konto') return { page: 'account' };
  return { page: 'overview' };
}

function Workspace({ auth }) {
  const { path, navigate } = useRouter();
  const { loading, error, data, refresh } = useAdminData();
  const content = useContent();
  const r = route(path);

  useEffect(() => { document.body.classList.add('is-admin'); return () => document.body.classList.remove('is-admin'); }, []);

  if (loading && !data) return <section className="section"><div className="wrap"><Loading text="Henter innholdet …" /></div></section>;
  if (error && !data) {
    return (
      <>
        <PageHead eyebrow="For styret" title="Fikk ikke kontakt med databasen" intro={error.message} />
        <section className="section"><div className="wrap" style={{ maxWidth: 640 }}><SetupCheck /></div></section>
      </>
    );
  }
  const { access } = data;
  const me = auth.session.user.email;

  if (!access.hasAccess) {
    return (
      <>
        <PageHead eyebrow="For styret" title="Ingen tilgang" />
        <section className="section"><div className="wrap prose">
          <p>Du er logget inn som <strong>{me}</strong>, men adressen har ikke fått noen rolle ennå.</p>
          <p>Be PSI-leder legge deg til under «Tilgang». Er du den første, kjør denne i Supabase → SQL Editor:</p>
          <pre className="code"><code>{`insert into public.members (email, role, title)\n  values ('${me}', 'psi_admin', 'Leder, PSI');`}</code></pre>
          <button className="btn btn--ghost" onClick={auth.signOut}>Logg ut</button>
          <SetupCheck />
        </div></section>
      </>
    );
  }

  const sports = access.visibleSports(data.sports);
  const go = (to) => navigate(`/admin${to}`);
  const ctx = { data, refresh, access, me, go, content, auth };

  let page;
  switch (r.page) {
    case 'group': page = <Group key={r.slug} slug={r.slug} tab={r.tab} {...ctx} />; break;
    case 'news': page = <NewsList {...ctx} />; break;
    case 'news-edit': page = <NewsEditor key={r.id} id={r.id} {...ctx} />; break;
    case 'calendar': page = <Calendar {...ctx} />; break;
    case 'event-edit': page = <EventEditor key={r.id} id={r.id} {...ctx} />; break;
    case 'media': page = <Media slug={r.slug} {...ctx} />; break;
    case 'partners': page = access.isAdmin ? <Partners {...ctx} /> : <NoAccess />; break;
    case 'settings': page = access.isAdmin ? <Settings {...ctx} /> : <NoAccess />; break;
    case 'access': page = <Access {...ctx} />; break;
    case 'account': page = <Account {...ctx} />; break;
    default: page = <Overview {...ctx} />;
  }

  const is = (p) => (p === '' ? path === '/admin' : path.startsWith(`/admin${p}`));
  const Item = ({ to, children, icon }) => (
    <Link to={`/admin${to}`} className={`adm__link${is(to) ? ' is-active' : ''}`}>{icon && <span className="adm__icon" aria-hidden="true">{icon}</span>}{children}</Link>
  );
  const draftCount = data.news.filter((n) => n.status === 'draft' && access.canManage(n.sport_slug)).length;

  return (
    <div className="adm">
      <aside className="adm__side" aria-label="Adminmeny">
        <div className="adm__brand">
          <span className="adm__brand-mark">PSI</span>
          <span>Admin<small>{access.roleLabel}</small></span>
        </div>
        <nav className="adm__nav">
          <Item to="" icon="◎">Oversikt</Item>
          <div className="adm__group">Grupper</div>
          {sports.map((sp) => <Item key={sp.slug} to={`/grupper/${sp.slug}`} icon={sp.icon}>{sp.name.replace(/^PSI\s+/, '')}{!sp.active && <span className="adm__dim"> · skjult</span>}</Item>)}
          <div className="adm__group">Innhold</div>
          <Item to="/nyheter" icon="✎">Nyheter{draftCount > 0 && <span className="adm__badge">{draftCount}</span>}</Item>
          <Item to="/kalender" icon="▦">Kalender</Item>
          <Item to="/bilder" icon="▣">Bilder</Item>
          {access.isAdmin && (
            <>
              <div className="adm__group">Nettstedet</div>
              <Item to="/partnere" icon="◇">Partnere</Item>
              <Item to="/innstillinger" icon="⚙">Innstillinger</Item>
            </>
          )}
          <div className="adm__group">Konto</div>
          <Item to="/tilgang" icon="⚇">Tilgang</Item>
          <Item to="/konto" icon="●">Min konto</Item>
        </nav>
        <div className="adm__user">
          <div className="adm__user-name">{access.name || me}</div>
          {access.name && <div className="adm__dim">{me}</div>}
          <div className="adm__user-actions">
            <Link to="/" className="btn btn--ghost btn--sm">Se nettsiden</Link>
            <button type="button" className="btn btn--ghost btn--sm" onClick={auth.signOut}>Logg ut</button>
          </div>
        </div>
      </aside>
      <div className="adm__main">
        {data.v2Missing && access.isAdmin && (
          <div className="notice" style={{ marginBottom: 'var(--sp-4)' }}>
            <strong>Databasen mangler migrasjonene.</strong> Roller, nyheter, kalender og bilder kommer først når de er kjørt.
            Til da virker grupper, partnere og innstillinger som før.
            <br />
            Kjør <code>.\scripts\db.ps1</code> i <code>psi</code>-mappa (se SETUP.md, «Databasen fra PowerShell»),
            eller lim filene i <code>supabase/migrations/</code> inn i Supabase → SQL Editor i rekkefølge.
          </div>
        )}
        {page}
      </div>
    </div>
  );
}

function NoAccess() {
  return <div className="empty"><p><strong>Bare PSI-admin har denne siden.</strong></p></div>;
}
