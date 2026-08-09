/**
 * Minimal history-API router.
 *
 * Three pages do not justify a routing dependency, but they do justify real
 * URLs: `/methodology` has to be linkable for the evidence to be worth
 * anything, and `/` has to be indexable as "svg to excalidraw converter".
 *
 * Requires the host to serve index.html for unknown paths (SPA fallback).
 * `vite/spa-fallback.ts` arranges that on GitHub Pages.
 *
 * Routes are written as if the app owned the domain root - `/icons`, not
 * `/excalidraw-svg/icons`. The deploy base is applied only at the boundary
 * where a route becomes a real URL, so nothing else has to know about it.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type ReactNode,
} from 'react';

export type RoutePath = '/' | '/icons' | '/methodology' | `/icons/${string}`;

const STATIC_ROUTES: RoutePath[] = ['/', '/icons', '/methodology'];

/**
 * Set ids come from folder names on disk, so they are trusted, but they still
 * reach this function from `window.location`. Anything outside this shape is
 * not a set id and collapses to the gallery rather than being reflected back
 * into the DOM.
 */
const SET_ID = /^[a-z0-9][a-z0-9._-]*$/i;

/** Trailing slashes and unknown paths both collapse onto a known route. */
export function normalizePath(raw: string): RoutePath {
  const trimmed = raw.replace(/\/+$/, '') || '/';

  const known = STATIC_ROUTES.find(r => r === trimmed);
  if (known) return known;

  const setMatch = trimmed.match(/^\/icons\/([^/]+)$/);
  if (setMatch) {
    const id = decodeURIComponent(setMatch[1]);
    return SET_ID.test(id) ? (`/icons/${id}` as RoutePath) : '/icons';
  }

  return '/';
}

/**
 * Where the app is mounted, with no trailing slash: `''` at a domain root,
 * `'/excalidraw-svg'` on a GitHub Pages project page.
 *
 * Optional chaining because this module is bundled by Vite but its pure
 * helpers are also imported by the unit tests, and `import.meta.env` is not
 * guaranteed outside a Vite pipeline - the same reason `optionsSchema.ts`
 * guards its `DEV` check.
 */
const BASE = (import.meta.env?.BASE_URL ?? '/').replace(/\/+$/, '');

/**
 * Removes the deploy base from a real pathname, leaving an app route.
 *
 * The boundary check matters: a bare `startsWith` would turn
 * `/excalidraw-svg-old/icons` into `-old/icons` and quietly route it to the
 * home page instead of leaving it alone.
 */
export function stripBase(pathname: string, base: string): string {
  if (!base || !pathname.startsWith(base)) return pathname;

  const rest = pathname.slice(base.length);
  return rest === '' || rest.startsWith('/') ? rest || '/' : pathname;
}

/** Turns an app route into a real URL for `href` and `pushState`. */
export function withBase(route: RoutePath, base: string): string {
  return `${base}${route}`;
}

/** The current route, with the deploy base removed. */
function currentRoute(): RoutePath {
  if (typeof window === 'undefined') return '/';
  return normalizePath(stripBase(window.location.pathname, BASE));
}

/** The set id in `/icons/<id>`, or null on any other route. */
export function iconSetIdFromPath(path: RoutePath): string | null {
  const match = path.match(/^\/icons\/([^/]+)$/);
  return match ? match[1] : null;
}

export function iconSetPath(setId: string): RoutePath {
  return `/icons/${setId}` as RoutePath;
}

interface RouterValue {
  path: RoutePath;
  navigate: (to: RoutePath) => void;
}

const RouterContext = createContext<RouterValue>({ path: '/', navigate: () => {} });

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState<RoutePath>(currentRoute);

  useEffect(() => {
    const onPop = () => setPath(currentRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: RoutePath) => {
    const next = normalizePath(to);
    if (next === currentRoute()) return;
    window.history.pushState({}, '', withBase(next, BASE));
    setPath(next);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const value = useMemo(() => ({ path, navigate }), [path, navigate]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  return useContext(RouterContext);
}

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: RoutePath;
}

/**
 * Renders a real `<a href>` so middle-click, ctrl-click and "copy link
 * address" all behave, and only intercepts the plain left click.
 */
export function Link({ to, onClick, children, ...rest }: LinkProps) {
  const { navigate } = useRouter();

  return (
    <a
      href={withBase(to, BASE)}
      onClick={event => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
