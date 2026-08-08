import type { ExcalidrawOptions } from '../../types';

/**
 * Owns the presets a set gets when it declares none. Pure data.
 *
 * Separate because it is 70 lines of literal sitting in the middle of the
 * resolution control flow, and because the only interesting thing about it -
 * the hachure/background pairing below - is a comment that was invisible
 * buried among the other functions.
 */

/**
 * Presets a set gets when it declares none.
 *
 * Expressed as patches over that set's own defaults, so a bare folder still
 * offers something useful without inheriting another set's colours.
 */
export const FALLBACK_PRESETS: {
  id: string;
  label: string;
  hint: string;
  options: Partial<ExcalidrawOptions>;
}[] = [
  {
    id: 'sketch',
    label: 'Sketch',
    hint: 'Hand-drawn frame',
    options: {
      showCard: true,
      cardCorners: 'square',
      cardStrokeWidth: 1,
      cardFillStyle: 'hachure',
      // Hachure is stroked in the background colour, so this needs one - the
      // preset used to pair it with `transparent` and had never drawn a hatch.
      // A tint rather than the accent itself: at full saturation the hatch
      // swamps both the artwork and the label.
      cardBgColor: '#e8f0fe',
      cardStrokeColor: '#4285f4',
      cardRoughness: 2,
      iconRoughness: 1,
      padding: 12,
    },
  },
  {
    id: 'dark-card',
    label: 'Dark card',
    hint: 'Soft dark panel',
    options: {
      showCard: true,
      cardCorners: 'rounded',
      cardStrokeWidth: 1,
      cardFillStyle: 'solid',
      cardBgColor: 'rgba(30, 41, 59, 0.8)',
      cardStrokeColor: '#4285f4',
      cardRoughness: 0,
      labelColor: '#f8fafc',
      padding: 12,
    },
  },
  {
    id: 'light-card',
    label: 'Light card',
    hint: 'Clean white panel',
    options: {
      showCard: true,
      cardCorners: 'rounded',
      cardStrokeWidth: 1,
      cardFillStyle: 'solid',
      cardBgColor: '#ffffff',
      cardStrokeColor: '#cbd5e1',
      cardRoughness: 0,
      labelColor: '#0f172a',
      padding: 12,
    },
  },
  {
    id: 'outline',
    label: 'Outline',
    hint: 'Unfilled frame, keeps the canvas showing through',
    options: {
      showCard: true,
      cardCorners: 'square',
      cardStrokeWidth: 2,
      cardFillStyle: 'solid',
      cardBgColor: 'transparent',
      cardStrokeColor: '#4285f4',
      cardRoughness: 0,
      padding: 12,
    },
  },
];
