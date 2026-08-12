import { type Dispatch, type SetStateAction, useCallback, useMemo } from 'react';
import type { IconSetSummary } from '../../types/icons';
import type { ExcalidrawOptions } from '../../types/options';
import {
  DEFAULT_EXCALIDRAW_OPTIONS,
  OPTIONS_STORAGE_VERSION,
  normaliseOptions,
} from '../../utils/defaultOptions';
import { asPartialOf, usePersistentState } from '../../hooks';
import { readLegacyOptions } from './legacyOptions';

/**
 * The styling options for one set: where they come from, how they are stored,
 * and how a stored value is validated on the way back in.
 *
 * All of it is namespaced per set. Sets declare their own defaults and presets
 * - flat product marks and hand-drawn category badges do not want the same
 * label font - and a single shared styling key would mean the first set opened
 * won, and every other set's declared defaults could never apply.
 */
export function useIconSetOptions(
  setId: string,
  summary: IconSetSummary | null | undefined
): [ExcalidrawOptions, Dispatch<SetStateAction<ExcalidrawOptions>>] {
  const setDefaults = summary?.defaults ?? DEFAULT_EXCALIDRAW_OPTIONS;

  /*
   * Styling is stored under a versioned key.
   *
   * `asPartialOf` alone cannot carry a v1 object across: it compares `typeof`
   * against the defaults, so it correctly drops `cardStyle` and `roughness`
   * (keys v2 does not have) but happily keeps `labelFontFamily`, whose type is
   * unchanged and whose *meaning* is not - v1's `5` meant Nunito and v2's `5`
   * means Excalifont. Reading a v1 object under the v2 key would silently
   * apply the wrong font and drop the frame style.
   *
   * So v1 is read from its own key, translated, and merged underneath the
   * stored v2 value. The old key is left in place: this runs on every render
   * of a page that can be opened in several tabs, and deleting it would make
   * the migration depend on which tab loaded first.
   */
  const restoreOptions = useCallback(
    (raw: unknown): ExcalidrawOptions | null => {
      const merged = asPartialOf(setDefaults as unknown as Record<string, unknown>)(
        raw
      ) as ExcalidrawOptions | null;
      return merged && normaliseOptions(merged);
    },
    [setDefaults]
  );

  const seedOptions = useMemo(
    () => normaliseOptions({ ...setDefaults, ...readLegacyOptions(setId) }),
    [setId, setDefaults]
  );

  return usePersistentState<ExcalidrawOptions>(
    `icons.${setId}.options.v${OPTIONS_STORAGE_VERSION}`,
    seedOptions,
    restoreOptions
  );
}
