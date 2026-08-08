import { useEffect, useMemo, useState } from 'react';
import type { IconAsset, IconSet } from '../../types';
import { loadIconSet } from '../../utils/iconSets';

/**
 * Materialising a set's icons, off the first-paint critical path.
 *
 * Separate from the set *summary*, which is available synchronously and is
 * what seeds the styling defaults. This is the expensive half: `loadIconSet`
 * runs SVGO over every file in the set.
 */
export function useIconSetData(setId: string): {
  set: IconSet | null;
  isLoading: boolean;
  icons: IconAsset[];
} {
  const [set, setSet] = useState<IconSet | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Materialising a set runs SVGO over every file in it, so it happens after
  // the first paint rather than blocking it.
  useEffect(() => {
    setIsLoading(true);
    const id = window.setTimeout(() => {
      setSet(loadIconSet(setId));
      setIsLoading(false);
    }, 0);
    return () => window.clearTimeout(id);
  }, [setId]);

  // Identity-stable while the set is unchanged, so the filter memos below it
  // are not invalidated by the empty-array fallback being re-allocated.
  const icons = useMemo(() => set?.icons ?? [], [set]);

  return { set, isLoading, icons };
}
