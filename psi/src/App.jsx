import { lazy, Suspense, useEffect } from 'react';
import { RouterProvider, useRouter, matchPath } from './lib/router.jsx';
import { useStrings, withLang, pick } from './lib/i18n.jsx';
import { ContentProvider, useContent } from './lib/content.jsx';
/* Admin lastes først når noen går til /admin, så publikum slipper vekten. */
const Admin = lazy(() => import('./admin/Admin.jsx'));
import Nav from './components/Nav.jsx';
import Footer from './components/Footer.jsx';
import Home from './pages/Home.jsx';
import Sports from './pages/Sports.jsx';
import SportPage from './pages/SportPage.jsx';
import Schedule from './pages/Schedule.jsx';
import Join from './pages/Join.jsx';
import About from './pages/About.jsx';
import Contact from './pages/Contact.jsx';
import Partners from './pages/Partners.jsx';
import Stand from './pages/Stand.jsx';
import NotFound from './pages/NotFound.jsx';
import News from './pages/News.jsx';
import Calendar from './pages/Calendar.jsx';
import AppInstall from './pages/AppInstall.jsx';
import NyVersjon from './components/NyVersjon.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

/* Rutene. Tittel-nøkkelen slås opp i strings for riktig språk. */
const ROUTES = [
  ['/', () => <Home />, (s) => null],
  ['/idretter', () => <Sports />, (s) => s.nav.sports],
  ['/idretter/:slug', (p) => <SportPage slug={p.slug} />, (s, p, c) => c.findSport(p.slug)?.name ?? s.notFound.title],
  ['/treningstider', () => <Schedule />, (s) => s.nav.schedule],
  ['/kalender', () => <Calendar />, (s) => s.nav.calendar],
  ['/nyheter', () => <News />, (s) => s.nav.news],
  ['/nyheter/:slug', (p) => <News slug={p.slug} />, (s, p, c, lang) => (c.findNews(p.slug) ? pick(c.findNews(p.slug).title, lang) : s.notFound.title)],
  ['/bli-med', () => <Join />, (s) => s.nav.join],
  ['/om', () => <About />, (s) => s.nav.about],
  ['/kontakt', () => <Contact />, (s) => s.nav.contact],
  ['/partnere', () => <Partners />, (s) => s.nav.partners],
  ['/stand', () => <Stand />, () => 'QR'],
  ['/app', () => <AppInstall />, (s) => s.app.nav],
];

function Shell() {
  const { path, lang } = useRouter();
  const s = useStrings();
  const content = useContent();
  const { site, organization } = content;

  let page = null;
  let title = s.notFound.title;
  const isAdmin = path === '/admin' || path.startsWith('/admin/');
  if (isAdmin) { page = <Suspense fallback={<section className="section"><div className="wrap"><p className="muted">Laster …</p></div></section>}><Admin /></Suspense>; title = 'Admin'; }
  for (const [pattern, render, titleOf] of ROUTES) {
    if (isAdmin) break;
    const params = matchPath(pattern, path);
    if (params) { page = render(params); title = titleOf(s, params, content, lang); break; }
  }

  useEffect(() => {
    const base = `${organization.shortName} – ${organization.name}`;
    const full = title ? `${title} · ${base}` : base;
    document.title = full;
    // Admin og stand-siden hører ikke hjemme i søkeresultater.
    setRobots(isAdmin || path === '/stand');
    const beskrivelse = title ? `${title}. ${s.hero.eyebrow}: ${organization.campus}.` : s.meta.description;
    setMeta('description', beskrivelse);
    // Delingskortene lå fast på norsk. De følger språket nå.
    setProp('og:title', title ? full : s.meta.ogTitle);
    setProp('og:description', title ? beskrivelse : s.meta.ogDescription);
    setProp('og:locale', s.meta.locale);
    setProp('og:locale:alternate', lang === 'nb' ? 'en_GB' : 'nb_NO');
    setProp('og:url', site.domain + withLang(path, lang));
    setMeta('twitter:title', title ? full : s.meta.ogTitle);
    setMeta('twitter:description', title ? beskrivelse : s.meta.ogDescription);
    setLink('canonical', site.domain + withLang(path, lang));
    setLink('alternate', site.domain + withLang(path, 'nb'), { hreflang: 'nb' });
    setLink('alternate', site.domain + withLang(path, 'en'), { hreflang: 'en' });
    setLink('alternate', site.domain + withLang(path, 'nb'), { hreflang: 'x-default' });
  }, [path, lang, title, s, site, organization, isAdmin]);

  return (
    <>
      <Nav />
      {/* Ny feilgrense per side: krasjer én side, skal ikke resten av
          nettstedet se ut som det er nede. */}
      <main id="innhold"><ErrorBoundary key={path}>{page ?? <NotFound />}</ErrorBoundary></main>
      {!isAdmin && <Footer />}
      <NyVersjon />
    </>
  );
}

/* noindex på sider som ikke skal ligge ute. Taggen legges til og fjernes,
   så resten av siden ser ut som før for søkemotorene. */
function setRobots(skjul) {
  const finnes = document.head.querySelector('meta[name="robots"]');
  if (!skjul) { finnes?.remove(); return; }
  const el = finnes || document.head.appendChild(document.createElement('meta'));
  el.setAttribute('name', 'robots');
  el.setAttribute('content', 'noindex, nofollow');
}

function setMeta(name, content) {
  const el = document.querySelector(`meta[name="${name}"]`);
  if (!el) return;
  if (content) el.setAttribute('content', content);
  else el.setAttribute('content', el.dataset.default || el.getAttribute('content'));
}
function setProp(prop, content) {
  if (!content) return;
  let el = document.head.querySelector(`meta[property="${prop}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', prop);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}
function setLink(rel, href, attrs = {}) {
  const sel = `link[rel="${rel}"]` + Object.entries(attrs).map(([k, v]) => `[${k}="${v}"]`).join('');
  let el = document.head.querySelector(sel);
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.head.appendChild(el);
  }
  el.href = href;
}

export default function App() {
  return (
    <RouterProvider>
      <ContentProvider>
        <Shell />
      </ContentProvider>
    </RouterProvider>
  );
}
