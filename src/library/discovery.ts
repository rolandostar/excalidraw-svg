// Supplied by vite/icon-sets.ts; typed in src/virtual-icon-sets.d.ts.
import { ICON_SETS } from 'virtual:icon-sets';
import type { IconSetManifest } from '../types/icons';
import { readViewBoxFromMarkup } from '../convert/style';

/**
 * The boundary with the build, and the only module in `src/` that cannot be
 * loaded outside Vite.
 *
 * Its own file for exactly that reason: `import 'virtual:icon-sets'` runs at
 * module scope, so anything that merges into here becomes unreachable from
 * the fidelity harness, which is plain Node. That happened once.
 *
 * Everything downstream sees a plain `Map<string, Discovered>` and can be
 * reasoned about, and tested, without Vite in the picture.
 */

/**
 * Loose files directly under `svg/`. Matched only so the mistake can be
 * reported: they are not a set and will not appear anywhere.
 */
const LOOSE_SVGS = import.meta.glob('../../../svg/*.svg', { eager: false });

/**
 * Nominal size of a set icon. 48 rather than the converter's 24 or the upload
 * path's 100: these are curated square marks, and 48 is what the gallery draws
 * them at.
 */
const FALLBACK_ICON_SIZE = { width: 48, height: 48 };

export function readIntrinsicSize(svg: string): { width: number; height: number } {
  const { width, height } = readViewBoxFromMarkup(svg, FALLBACK_ICON_SIZE);
  return { width, height };
}

export interface Discovered {
  id: string;
  manifest: IconSetManifest;
  hasManifest: boolean;
  /** Already-optimised markup, name-sorted. */
  files: Array<{ name: string; svg: string }>;
}

let discovered: Map<string, Discovered> | null = null;

export function discover(): Map<string, Discovered> {
  if (discovered) return discovered;

  const sets = new Map<string, Discovered>(
    ICON_SETS.map(set => [
      set.id,
      {
        id: set.id,
        manifest: (set.manifest ?? {}) as IconSetManifest,
        hasManifest: Object.keys(set.manifest ?? {}).length > 0,
        files: set.icons,
      },
    ])
  );

  const loose = Object.keys(LOOSE_SVGS).length;
  if (loose > 0 && import.meta.env?.DEV) {
    console.warn(
      `[iconSets] ${loose} SVG file(s) sit directly in svg/ and will not appear on the site. ` +
        `Icons must live in a set folder, e.g. svg/my-set/icon.svg`
    );
  }

  discovered = sets;
  return sets;
}

/**
 * Owns the presets a set gets when it declares none. Pure data.
 *
 * Separate because it is 70 lines of literal sitting in the middle of the
 * resolution control flow, and because the only interesting thing about it -
 * the hachure/background pairing below - is a comment that was invisible
 * buried among the other functions.
 */
