import { FONT_FAMILIES, ROUGHNESS } from '../../types/options';
import type {
  CardCorners,
  CardFillStyle,
  CardStrokeWidth,
  LabelFontFamily,
  LabelPosition,
  Roughness,
} from '../../types/options';

/**
 * Display name for every enumerated option value.
 *
 * A `Record` keyed by the union rather than a ternary in the control, so
 * widening the union is a type error here instead of a segmented control that
 * silently labels the new value as one of the old ones.
 */
export const CORNER_LABELS: Record<CardCorners, string> = {
  rounded: 'Rounded',
  square: 'Square',
};

export const STROKE_WIDTH_LABELS: Record<CardStrokeWidth, string> = {
  1: 'Thin',
  2: 'Bold',
  4: 'Extra',
};

export const FILL_LABELS: Record<CardFillStyle, string> = {
  solid: 'Solid',
  hachure: 'Hachure',
  'cross-hatch': 'Cross',
};

export const POSITION_LABELS: Record<LabelPosition, string> = {
  bottom: 'Bottom',
  right: 'Right',
  top: 'Top',
};

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

/*
 * The controls iterate the allow-lists themselves rather than a local copy.
 * `satisfies` catches a value the union does not have; it cannot catch one
 * the union has and the copy is missing, which is the direction that leaves a
 * shipped option with no control.
 */
export const ROUGHNESS_VALUES = ROUGHNESS;
export const FONT_VALUES = FONT_FAMILIES;
