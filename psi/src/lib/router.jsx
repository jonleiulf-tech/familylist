import { createContext, useContext, useEffect, useState } from 'react';
import { LangCtx, splitLang, withLang } from './i18n.jsx';

/* Liten ruter på History API. Ingen avhengighet.
   Mønstre som '/idretter/:slug' matcher og gir params.
   Språkprefikset /en håndteres her, så sidene ser bare den språkløse
   stien og Link legger prefikset på igjen. */

const RouterCtx = createContext({ path: '/', navigate: () => {} });

export function RouterProvider({ children }) {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const { lang, path } = splitLang(pathname);

  const navigate = (to, { replace = false, lang: nextLang = lang } = {}) => {
    const full = withLang(to, nextLang);
    if (full === window.location.pathname) return;
    window.history[replace ? 'replaceState' : 'pushState']({}, '', full);
    setPathname(full);
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    document.documentElement.lang = lang === 'nb' ? 'nb' : 'en';
  }, [lang]);

  return (
    <LangCtx.Provider value={lang}>
      <RouterCtx.Provider value={{ path, lang, navigate }}>{children}</RouterCtx.Provider>
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
  const current = path === to || (to !== '/' && path.startsWith(to + '/'));
  return (
    <a
      href={withLang(to, target)}
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
