import type { ExcalidrawElement } from '../types';

/**
 * Bounded, insertion-ordered cache of conversion results.
 *
 * `parseSvgToExcalidrawElements` runs a DOMParser, flattens every Bezier and
 * then does polygon booleans for clips and masks. Multiplied by 216 cards it
 * is the single most expensive thing on the page, and the icon-scale slider
 * invalidates all of them at once. A per-card `useMemo` cannot help there
 * because dragging back to a previous value re-does the work from scratch.
 *
 * Bounded so a long drag across the whole slider range cannot grow without
 * limit; a `Map` is insertion-ordered, so the oldest key is the first one.
 *
 * Module-level state in a component file is untestable by construction - there
 * is no way to get back to a known empty cache between assertions - so it
 * lives here with an explicit `clear()`.
 */
const MAX_CACHED_SCENES = 900;

const cache = new Map<string, ExcalidrawElement[]>();

export function sceneCacheKey(iconId: string, exportPx: number, roughness: number): string {
  return `${iconId}|${exportPx}|${roughness}`;
}

export function getCachedScene(key: string): ExcalidrawElement[] | undefined {
  return cache.get(key);
}

export function setCachedScene(key: string, elements: ExcalidrawElement[]): void {
  if (cache.size >= MAX_CACHED_SCENES) {
    /*
     * `keys().next()` legitimately yields `undefined` on an empty map, and the
     * old code cast that away with `as string` - which would have deleted the
     * key `"undefined"` rather than evicting anything. Unreachable while
     * MAX_CACHED_SCENES is positive, but the cast made the guard invisible.
     */
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }

  cache.set(key, elements);
}

/** Drops everything. Exists so a test can start from a known state. */
export function clear(): void {
  cache.clear();
}

/** Current entry count. For assertions about eviction. */
export function size(): number {
  return cache.size;
}
