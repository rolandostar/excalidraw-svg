import type { LabelFontFamily, Roughness } from '../../types/options';

/**
 * Display names for the two enumerated option values that have no sensible
 * automatic rendering - a font id and a roughness level are both numbers the
 * user should never see.
 */

/**
 * Excalidraw's real font ids. See the note on `LabelFontFamily` for why these
 * are not 1-5, and why "Lilita One" never used to render.
 */
export const FONT_NAMES: Record<LabelFontFamily, string> = {
  5: 'Excalifont',
  6: 'Nunito',
  7: 'Lilita One',
  8: 'Comic Shanns',
  9: 'Liberation',
};

export const ROUGHNESS_LABELS: Record<Roughness, string> = {
  0: 'Clean',
  1: 'Subtle',
  2: 'Sketch',
};

/** The roughness values, in the order the segmented control shows them. */
export const ROUGHNESS_VALUES = [0, 1, 2] as const satisfies readonly Roughness[];

/** The font ids offered, in the order the font grid shows them. */
export const FONT_VALUES = [5, 6, 7, 8, 9] as const satisfies readonly LabelFontFamily[];
