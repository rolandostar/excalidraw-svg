import { useCallback, useEffect, useState } from 'react';
import { storageKey } from './usePersistentState';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = storageKey('theme');

const PREFERENCES: ThemePreference[] = ['system', 'light', 'dark'];

function isPreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (PREFERENCES as string[]).includes(value);
}

export function readStoredPreference(): ThemePreference {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isPreference(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

export function systemTheme(): ResolvedTheme {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
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

  const cycle = useCallback(() => {
    setPreference(prev => PREFERENCES[(PREFERENCES.indexOf(prev) + 1) % PREFERENCES.length]);
  }, []);

  return { preference, setPreference, resolved, cycle };
}
