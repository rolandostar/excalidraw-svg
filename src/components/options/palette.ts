/**
 * The colour palettes the styling sidebar offers, their accessible names, and
 * the two pure functions that decide how a swatch is presented.
 *
 * Data only, so the swatch row and the sections that use it can be read
 * without scrolling past ninety lines of hex.
 */

import { GCP_BLUE } from '../../types/options';

export const BG_COLORS = [
  'rgba(30, 41, 59, 0.8)',
  '#0f172a',
  '#1e293b',
  '#ffffff',
  '#e8f0fe',
  '#e6f4ea',
  '#fef7e0',
  '#fce8e6',
  '#f3e8fd',
  'transparent',
];

export const STROKE_COLORS = [
  GCP_BLUE,
  '#34a853',
  '#fbbc05',
  '#ea4335',
  '#a142f4',
  '#64748b',
  '#cbd5e1',
  '#1e293b',
  'transparent',
];

export const TEXT_COLORS = [
  '#ffffff',
  '#f8fafc',
  '#cbd5e1',
  '#94a3b8',
  '#64748b',
  GCP_BLUE,
  '#34a853',
  '#fbbc05',
  '#ea4335',
  '#a142f4',
  '#1e293b',
  '#0f172a',
];

/**
 * Ensures the picker always contains the value it is meant to be showing.
 *
 * Sets choose their own label and frame colours, and nothing constrains those
 * to this palette - `unique-icons` labels in its own accent. The custom-colour
 * field can produce anything at all. Without this the active swatch simply
 * would not be in the row, so the control would look unset and there would be
 * no way back to it after trying another colour.
 */
export function withCurrent(palette: string[], current: string): string[] {
  return palette.includes(current) ? palette : [...palette, current];
}

export const COLOR_NAMES: Record<string, string> = {
  'rgba(30, 41, 59, 0.8)': 'Slate, translucent',
  'rgba(30, 41, 59, 0.6)': 'Slate, translucent',
  '#0f172a': 'Near black',
  '#ffffff': 'White',
  '#f8fafc': 'Off white',
  '#e8f0fe': 'Blue tint',
  '#e6f4ea': 'Green tint',
  '#fef7e0': 'Yellow tint',
  '#fce8e6': 'Red tint',
  '#f3e8fd': 'Purple tint',
  [GCP_BLUE]: 'Blue',
  '#34a853': 'Green',
  '#fbbc05': 'Yellow',
  '#ea4335': 'Red',
  '#a142f4': 'Purple',
  '#64748b': 'Grey',
  '#94a3b8': 'Light grey',
  '#cbd5e1': 'Pale grey',
  '#1e293b': 'Dark slate',
  transparent: 'None',
};

/**
 * Whether a swatch fill is light enough to need a dark tick drawn on it.
 *
 * The stylesheet cannot work this out for itself: it used to try, with
 * `.color-swatch[style*="#ffffff"]`, but React serialises the inline
 * background as `rgb(255, 255, 255)` so those selectors never matched and
 * every pale swatch drew a white check on a white fill. Anything that is not
 * a plain hex - `transparent`, an `rgba()` - is not light; `transparent` has
 * its own attribute.
 */
export function isLightColor(color: string): boolean {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return false;

  const full = hex.length === 3 ? hex.replace(/./g, c => c + c) : hex;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;

  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.7;
}
