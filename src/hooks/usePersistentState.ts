import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

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
