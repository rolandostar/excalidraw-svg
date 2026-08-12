import { beforeEach, describe, expect, it } from 'vitest';
import { clear, getCachedScene, sceneCacheKey, setCachedScene, size } from './sceneCache';
import type { ExcalidrawElement } from '../types';

const scene = (id: string) => [{ id } as ExcalidrawElement];

beforeEach(clear);

describe('sceneCacheKey', () => {
  it('separates the three things that invalidate a scene', () => {
    const keys = new Set([
      sceneCacheKey('a', 96, 0),
      sceneCacheKey('a', 96, 1),
      sceneCacheKey('a', 192, 0),
      sceneCacheKey('b', 96, 0),
    ]);
    expect(keys.size).toBe(4);
  });
});

describe('eviction', () => {
  const fill = (count: number, from = 0) => {
    for (let i = from; i < from + count; i++) setCachedScene(`k${i}`, scene(`k${i}`));
  };

  it('round-trips a scene', () => {
    setCachedScene('k', scene('k'));
    expect(getCachedScene('k')).toEqual(scene('k'));
    expect(getCachedScene('absent')).toBeUndefined();
  });

  it('stays bounded once the limit is reached', () => {
    fill(1200);
    expect(size()).toBeLessThanOrEqual(900);
  });

  /**
   * A `Map` is insertion-ordered, so the first key out is the oldest. The
   * guard around it matters: `keys().next()` yields `{ done: true }` on an
   * empty map, and reading `.value` off that unchecked deletes the key
   * `"undefined"` instead of evicting anything.
   */
  it('evicts oldest first, and never invents a key', () => {
    fill(900);
    expect(getCachedScene('k0')).toBeDefined();

    fill(1, 900);
    expect(getCachedScene('k0')).toBeUndefined();
    expect(getCachedScene('k1')).toBeDefined();
    expect(getCachedScene('k900')).toBeDefined();
    expect(getCachedScene('undefined')).toBeUndefined();
  });

  it('starts empty after clear', () => {
    fill(10);
    clear();
    expect(size()).toBe(0);
  });
});
