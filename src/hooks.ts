import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';

/**
 * Every React hook in the app.
 *
 * Four unrelated concerns, kept together because each is one small hook and
 * a reader looking for "what state does this app keep outside components"
 * should find the answer in one place:
 *
 *   usePersistentState   localStorage-backed state, and the validators
 *   useTheme             theme preference, with a live "follow system" mode
 *   useClipboardCopy     write JSON to the clipboard, plus the "Copied" flag
 *   useHasBeenVisible    sticky viewport check that drives lazy conversion
 */

// ---------------------------------------------------------------------------
// usePersistentState
// ---------------------------------------------------------------------------

/**
 * `useState` that survives a reload.
 *
 * Restyling 216 icons is a multi-minute task and losing all of it to an
 * accidental refresh is the kind of small betrayal that makes a tool feel
 * disposable.
 *
 * Stored values are validated on read, never trusted. localStorage outlives
 * deploys, so yesterday's shape will eventually be handed to today's code -
 * an option removed from the schema, an enum that lost a member, or a value
 * some other tab corrupted. Anything that fails validation is discarded in
 * favour of the default rather than crashing the page.
 */
const NAMESPACE = 'excalidraw-svg';

export function storageKey(key: string): string {
  return `${NAMESPACE}:${key}`;
}

export function usePersistentState<T>(
  key: string,
  initial: T,
  validate: (raw: unknown) => T | null
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initial;
    try {
      const stored = window.localStorage.getItem(storageKey(key));
      if (stored === null) return initial;
      return validate(JSON.parse(stored)) ?? initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey(key), JSON.stringify(value));
    } catch {
      // Private browsing and full quotas both throw. Persistence is a
      // convenience; losing it must never take the page down with it.
    }
  }, [key, value]);

  return [value, setValue];
}

/** Discards anything that is not a string. */
export const asString = (raw: unknown): string | null =>
  typeof raw === 'string' ? raw : null;

/** Discards anything that is not an array of strings. */
export const asStringArray = (raw: unknown): string[] | null =>
  Array.isArray(raw) && raw.every(v => typeof v === 'string') ? (raw as string[]) : null;

export const asBoolean = (raw: unknown): boolean | null =>
  typeof raw === 'boolean' ? raw : null;

/**
 * Merges a stored object over defaults, keeping only keys the defaults define
 * and only when the stored value has the same primitive type. A field added or
 * retyped since the value was written falls back to its default instead of
 * poisoning the whole object.
 */
export function asPartialOf<T extends Record<string, unknown>>(defaults: T) {
  return (raw: unknown): T | null => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;

    const stored = raw as Record<string, unknown>;
    const merged = { ...defaults };

    for (const key of Object.keys(defaults) as (keyof T)[]) {
      const candidate = stored[key as string];
      if (candidate === undefined) continue;
      if (typeof candidate !== typeof defaults[key]) continue;
      merged[key] = candidate as T[keyof T];
    }

    return merged;
  };
}

// ---------------------------------------------------------------------------
// useTheme
// ---------------------------------------------------------------------------

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = storageKey('theme');

const PREFERENCES: ThemePreference[] = ['system', 'light', 'dark'];

function isPreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (PREFERENCES as string[]).includes(value);
}

function readStoredPreference(): ThemePreference {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isPreference(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? systemTheme() : preference;
}

/**
 * Theme preference with a real "follow system" mode.
 *
 * "System" is a live subscription, not a one-off read: macOS and Windows both
 * switch theme on a schedule, and a tab left open across that boundary should
 * follow rather than sit in yesterday's theme until reloaded.
 *
 * The attribute is applied to <html> rather than a React root so the page
 * background is correct in the gap before hydration, and so the inline script
 * in index.html can set the same attribute before first paint.
 */
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(() =>
    typeof window === 'undefined' ? 'system' : readStoredPreference()
  );
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    typeof window === 'undefined' ? 'dark' : resolveTheme(readStoredPreference())
  );

  useEffect(() => {
    const apply = () => {
      const next = resolveTheme(preference);
      setResolved(next);
      document.documentElement.dataset.theme = next;
    };

    apply();

    try {
      // Stored raw, not JSON-encoded: the inline script in index.html reads
      // this before any bundle loads and compares it as a plain string.
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // Persistence is a convenience; a full quota must not break theming.
    }

    if (preference !== 'system') return;

    const media = window.matchMedia('(prefers-color-scheme: light)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preference]);

  return { preference, setPreference, resolved };
}

/**
 * Writing generated JSON to the clipboard, plus the "Copied" flag that follows.
 *
 * Three components had grown their own version of this - the icon card, the
 * toolbar and the conversion panel - and all three did the same four things:
 * build the JSON, `navigator.clipboard.writeText`, signal success, swallow the
 * failure. Two of them had already converged on the same literal error string.
 *
 * The failure is swallowed on purpose. `writeText` rejects for reasons the
 * user cannot act on and did not cause - an insecure origin, a document that
 * lost focus mid-gesture, a permissions policy - so the honest response is one
 * line of feedback, not an exception surfacing through a click handler.
 *
 * The reset timer is held in a ref and cleared on unmount, so a card that
 * scrolls out of the tree mid-flash cannot set state afterwards.
 */
// ---------------------------------------------------------------------------
// useClipboardCopy
// ---------------------------------------------------------------------------

const CLIPBOARD_ERROR = 'Could not access the clipboard.';

interface ClipboardCopyOptions {
  /** How long `copied` stays true after a successful write. */
  resetMs?: number;
  /** Runs only on success, after `copied` is set. Confetti, toasts, resets. */
  onSuccess?: () => void;
  /** Runs only on failure. Defaults to doing nothing but leaving `copied` false. */
  onError?: (message: string) => void;
}

export function useClipboardCopy(options: ClipboardCopyOptions = {}) {
  const [copied, setCopied] = useState(false);

  // Callers pass inline arrows, so the options object is a new identity on
  // every render. Reading them through a ref keeps `copy` itself stable.
  const latest = useRef(options);
  latest.current = options;

  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  /**
   * `text` may be a thunk so an expensive serialisation is only paid for when
   * the copy is actually attempted.
   */
  const copy = useCallback(async (text: string | (() => string)): Promise<boolean> => {
    const { resetMs = 1600, onSuccess, onError } = latest.current;

    try {
      await navigator.clipboard.writeText(typeof text === 'function' ? text() : text);
    } catch {
      setCopied(false);
      onError?.(CLIPBOARD_ERROR);
      return false;
    }

    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), resetMs);

    onSuccess?.();
    return true;
  }, []);

  return { copied, copy };
}

// ---------------------------------------------------------------------------
// useHasBeenVisible
// ---------------------------------------------------------------------------

/**
 * Whether an element has ever come near the viewport.
 *
 * Deliberately sticky. The expensive work behind this flag - converting an SVG
 * and running Excalidraw's exporter - is cached once done, so unmounting a
 * preview that scrolled away would only buy a repaint later at the cost of
 * redoing the work. What matters is never doing it for the ~200 cards the user
 * has not looked at.
 *
 * Falls back to visible when `IntersectionObserver` is missing, so a headless
 * or ancient environment renders everything rather than nothing.
 */
export function useHasBeenVisible(ref: RefObject<Element | null>, rootMargin = '600px'): boolean {
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined');

  /*
   * The guard is a ref, not the state value.
   *
   * `seen` used to be listed as a dependency of the effect that sets it, so
   * becoming visible tore down the observer and immediately re-ran the whole
   * effect - constructing a second `IntersectionObserver` purely to hit the
   * early return. Once-only is a fact about this effect, not a value it should
   * be re-subscribed on.
   */
  const done = useRef(seen);

  useEffect(() => {
    if (done.current) return;

    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          done.current = true;
          setSeen(true);
          observer.disconnect();
        }
      },
      // Generous margin so a card is converted before it is scrolled into
      // view; landing on a placeholder is worse than doing the work early.
      { rootMargin }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, rootMargin]);

  return seen;
}
