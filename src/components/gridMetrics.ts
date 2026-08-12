import type { IconAsset } from '../types/icons';
import type { ExcalidrawOptions } from '../types/options';
import { measureExcalidrawItem } from '../utils/layout/itemLayout';

/**
 * Sizing shared by the icon grid and the cards inside it.
 *
 * These live together because they are one decision split across two
 * components: `IconsPage` picks a track width, `IconGrid` turns it into a
 * column count and an exact column width, and `IconCard` divides by that width
 * to get its scale factor. Any of the three disagreeing shows up as cards
 * rendered smaller than their cell, or overflowing it.
 */

/**
 * Height of the box a card's preview is drawn into, in CSS pixels.
 *
 * Chosen so the common case renders at true size: a default 1x card with a
 * bottom label measures 96 x 127 units, which fits 140px without scaling. Cards
 * larger than this are scaled down; smaller ones are centred, not stretched, so
 * `iconScale` still reads as a size difference rather than being normalised
 * away.
 *
 * Fixed rather than per-card, so grid rows stay level.
 */
export const STAGE_HEIGHT_PX = 140;

/**
 * Column width minus stage width: `.icon-card`'s horizontal padding *and* its
 * border.
 *
 * 0.5rem of padding each side plus a 1px border each side. The border is easy
 * to miss - it is transparent until hover - and omitting it makes every card
 * two pixels wider than the box it is scaled into, clipping a hairline off
 * both edges.
 */
export const CARD_PADDING_X = 18;

/** Gap between grid cells, matching `.icon-grid`'s `gap`. */
export const GRID_GAP_PX = 12;

/**
 * Narrowest track. Below about this the label is unreadable and the grid is
 * mostly gutter.
 */
export const MIN_TRACK_PX = 132;

/**
 * Widest track.
 *
 * A side-label card at 1.5x can measure 400 units across, and sizing the track
 * to show that at full scale would leave two columns. Capping trades some scale
 * for a grid that can still be browsed.
 */
const MAX_TRACK_PX = 260;

/**
 * Scale a wide card is allowed to shrink to before the track grows instead.
 *
 * Only bites once a layout is genuinely wide - a typical bottom-label card is
 * narrower than `MIN_TRACK_PX` at 1x, so it never moves the track.
 */
const TARGET_SCALE = 0.6;

/**
 * Card width the track is sized against, as a quantile of the set.
 *
 * Not the maximum. Title length has a long tail - in `legacy-gcp` the median
 * card is 136 units wide, the 90th percentile 225, and "Managed Service For
 * Microsoft Active Directory" 424 - so sizing to the widest let one icon out
 * of 216 push the grid from seven columns down to three. The tail is handled
 * by `MIN_CARD_SCALE` instead, which keeps those few cards legible and lets
 * them overflow.
 */
const TRACK_QUANTILE = 0.9;

/**
 * Floor on a card's scale factor, below which it overflows its stage instead.
 *
 * A long title makes for a genuinely wide export - 424 units against a 96-unit
 * icon - and scaling all of that into a cell would leave a 26px icon, which
 * reads as a broken grid rather than as a long name. Below this the card keeps
 * its proportions and runs past the edges; the stage clips it and fades the
 * cut, so the overflow is visible as overflow.
 *
 * Applied to the width fit only. Height always fits, or the label would be
 * sliced off horizontally with nothing to indicate it.
 */
const MIN_CARD_SCALE = 0.45;

/**
 * Track width that keeps a typical card in this set readable.
 *
 * Uses the *nominal* measurement, so it needs no conversion and can run over
 * the whole set on every options change. Under `fitFrame` the real cards are
 * smaller than measured here, which only ever means a slightly roomier track.
 */
export function trackWidthFor(icons: IconAsset[], options: ExcalidrawOptions): number {
  if (icons.length === 0) return MIN_TRACK_PX;

  const widths = icons
    .map(icon => measureExcalidrawItem(icon, options).cardWidth)
    .sort((a, b) => a - b);

  const representative = widths[Math.floor(TRACK_QUANTILE * (widths.length - 1))];
  const wanted = Math.ceil(representative * TARGET_SCALE) + CARD_PADDING_X;

  return Math.max(MIN_TRACK_PX, Math.min(MAX_TRACK_PX, wanted));
}

/**
 * Scale that fits a card into its stage, and whether it had to overflow.
 *
 * Never scales up: a card smaller than the stage is centred at true size, so
 * `iconScale` still reads as a size difference across the grid rather than
 * being normalised away.
 */
export function cardScaleFor(
  cardWidth: number,
  cardHeight: number,
  stageWidth: number
): { scale: number; isClipped: boolean } {
  const fitWidth = stageWidth / cardWidth;
  const fitHeight = STAGE_HEIGHT_PX / cardHeight;
  const scale = Math.min(1, Math.max(fitWidth, MIN_CARD_SCALE), fitHeight);

  return { scale, isClipped: scale > fitWidth };
}

/**
 * Column count for a measured container, mirroring `auto-fill` with `minmax`.
 *
 * Computed rather than left to `auto-fill` because the cards need to know how
 * wide a column ended up: `1fr` stretches the last row's worth of leftover
 * space into every column, and a card that assumed the track width would then
 * render smaller than the space it was given.
 */
export function columnCountFor(containerWidth: number, trackPx: number): number {
  if (!(containerWidth > 0)) return 1;
  return Math.max(1, Math.floor((containerWidth + GRID_GAP_PX) / (trackPx + GRID_GAP_PX)));
}

export function columnWidthFor(containerWidth: number, columns: number): number {
  if (!(containerWidth > 0) || columns < 1) return MIN_TRACK_PX;
  return (containerWidth - GRID_GAP_PX * (columns - 1)) / columns;
}
