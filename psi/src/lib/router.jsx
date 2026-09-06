import { createContext, useContext, useEffect, useState } from 'react';
import { LangCtx, splitLang, withLang } from './i18n.jsx';

/* Liten ruter på History API. Ingen avhengighet.
   Mønstre som '/idretter/:slug' matcher og gir params.
   Språkprefikset /en håndteres her, så sidene ser bare den språkløse
   stien og Link legger prefikset på igjen. */

const RouterCtx = createContext({ path: '/', search: '', navigate: () => {} });

/* '/nyheter?gruppe=fotball' → ['/nyheter', '?gruppe=fotball'] */
function delAdresse(to) {
  const i = to.indexOf('?');
  return i === -1 ? [to, ''] : [to.slice(0, i), to.slice(i)];
}

/* Sider som har noe ulagret kan be om å bli spurt først. beforeunload
   dekker bare fanelukking og oppdatering – klikk i adminmenyen går
   gjennom navigate(), og der fantes det ingen sperre. */
const vakter = new Set();

export function registerLeaveGuard(fn) {
  vakter.add(fn);
  return () => vakter.delete(fn);
}

function kanForlate() {
  for (const fn of vakter) {
    const melding = fn();
    if (melding && !window.confirm(melding)) return false;
  }
  return true;
}

export function RouterProvider({ children }) {
  // Stien og spørrestrengen holdes hver for seg. Ligger de sammen, blir
  // '/nyheter?gruppe=fotball' aldri gjenkjent som ruten '/nyheter'.
  const [sted, setSted] = useState(() => ({ pathname: window.location.pathname, search: window.location.search }));

  useEffect(() => {
    const onPop = () => setSted({ pathname: window.location.pathname, search: window.location.search });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const { lang, path } = splitLang(sted.pathname);

  const navigate = (to, { replace = false, lang: nextLang = lang } = {}) => {
    const [rå, søk] = delAdresse(to);
    const nyPath = withLang(rå, nextLang);
    const full = nyPath + søk;
    if (full === window.location.pathname + window.location.search) return;
    // Bare når man faktisk forlater siden. Filtrene på /nyheter skriver
    // om spørrestrengen hele tiden, og skal ikke spørre om noe.
    if (nyPath !== window.location.pathname && !kanForlate()) return;
    window.history[replace ? 'replaceState' : 'pushState']({}, '', full);
    setSted({ pathname: nyPath, search: søk });
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    document.documentElement.lang = lang === 'nb' ? 'nb' : 'en';
  }, [lang]);

  return (
    <LangCtx.Provider value={lang}>
      <RouterCtx.Provider value={{ path, lang, search: sted.search, navigate }}>{children}</RouterCtx.Provider>
    </LangCtx.Provider>
  );
}

export function useRouter() {
  return useContext(RouterCtx);
}

export function matchPath(pattern, path) {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  if (p.length !== s.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

export function Link({ to, lang: toLang, children, className, ...rest }) {
  const { navigate, path, lang } = useRouter();
  const target = toLang ?? lang;
  const [rent] = to.split('?');
  const current = path === rent || (rent !== '/' && path.startsWith(rent + '/'));
  return (
    <a
      href={withLang(rent, target) + to.slice(rent.length)}
      className={className}
      aria-current={current && target === lang ? 'page' : undefined}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to, { lang: target });
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
