/**
 * Minimal history-API router.
 *
 * Three pages do not justify a routing dependency, but they do justify real
 * URLs: `/methodology` has to be linkable for the evidence to be worth
 * anything, and `/` has to be indexable as "svg to excalidraw converter".
 *
 * Requires the host to serve index.html for unknown paths (SPA fallback).
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

export type RoutePath = '/' | '/icons' | '/methodology';

const ROUTES: RoutePath[] = ['/', '/icons', '/methodology'];

/** Trailing slashes and unknown paths both collapse onto a known route. */
export function normalizePath(raw: string): RoutePath {
  const trimmed = raw.replace(/\/+$/, '') || '/';
  return (ROUTES.find(r => r === trimmed) ?? '/') as RoutePath;
}

interface RouterValue {
  path: RoutePath;
  navigate: (to: RoutePath) => void;
}

const RouterContext = createContext<RouterValue>({ path: '/', navigate: () => {} });

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState<RoutePath>(() =>
    normalizePath(typeof window === 'undefined' ? '/' : window.location.pathname)
  );

  useEffect(() => {
    const onPop = () => setPath(normalizePath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: RoutePath) => {
    const next = normalizePath(to);
    if (next === normalizePath(window.location.pathname)) return;
    window.history.pushState({}, '', next);
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
      href={to}
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
