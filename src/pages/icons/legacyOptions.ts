import type { ExcalidrawOptions } from '../../types/options';
import {
  DEFAULT_EXCALIDRAW_OPTIONS,
  looksLikeV1Options,
  migrateOptionsV1,
} from '../../utils/defaultOptions';
import { asPartialOf, storageKey } from '../../hooks';

/**
 * Reading the pre-v2 styling key out of localStorage.
 *
 * Isolated here because it is the only part of the icons page that has to know
 * anything about a storage format the app no longer writes, and because it is
 * the part most likely to be deleted outright once enough time has passed.
 */

/**
 * Whatever a pre-v2 build left behind for this set, translated into v2 shape.
 *
 * Used only as the *seed* for the v2 key, so it is overridden the moment a v2
 * value exists. Returns `{}` for anything missing or unparseable - a failed
 * migration must fall through to the set's defaults, never take the page down.
 */
export function readLegacyOptions(setId: string): Partial<ExcalidrawOptions> {
  if (typeof window === 'undefined') return {};

  try {
    const stored = window.localStorage.getItem(storageKey(`icons.${setId}.options`));
    if (stored === null) return {};

    const raw: unknown = JSON.parse(stored);
    if (!looksLikeV1Options(raw)) return {};

    /*
     * Only keys the stored object actually had are carried over.
     *
     * `asPartialOf` returns a *complete* object, filling absent keys from the
     * defaults it was given - which is what a restore wants and a migration
     * does not. Left unfiltered, a v1 object with no `labelColor` would arrive
     * carrying the app's grey and overwrite the set's own accent, so migrating
     * would quietly reset colours the user never touched.
     */
    const stale = raw as Record<string, unknown>;
    const merged = asPartialOf(DEFAULT_EXCALIDRAW_OPTIONS as unknown as Record<string, unknown>)(raw);
    const carried: Record<string, unknown> = {};

    if (merged) {
      for (const key of Object.keys(merged)) {
        if (key in stale) carried[key] = merged[key];
      }
    }

    // Keys whose meaning changed are rewritten last and win outright.
    return { ...carried, ...migrateOptionsV1(raw) } as Partial<ExcalidrawOptions>;
  } catch {
    return {};
  }
}
