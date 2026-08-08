/**
 * How big one item is and where its parts sit inside it - measured, never
 * assumed.
 *
 * Separate from `buildItem.ts` because the grid packers, the fidelity harness
 * and the card preview all need to *ask* for a layout without building one,
 * and because everything here is pure arithmetic over an `IconAsset` and an
 * `ExcalidrawOptions`.
 */
import type { ExcalidrawElement, ExcalidrawOptions, IconAsset } from '../../types';
import { ICON_BASE_SIZE } from '../defaultOptions';
import { measureLabel } from '../textMetrics';
import { boundsOf } from '../svg/geometry';

export interface ItemLayout {
  cardWidth: number;
  cardHeight: number;
  iconWidth: number;
  iconHeight: number;
  labelWidth: number;
  labelHeight: number;
  /** Offsets from the item origin, not absolute coordinates. */
  iconDx: number;
  iconDy: number;
  labelDx: number;
  labelDy: number;
}

/** Gap between the artwork and the label, in canvas units. */
const LABEL_GAP_STACKED = 8;
const LABEL_GAP_BESIDE = 12;

/** Axis-aligned bounding box of a set of elements, in absolute scene units. */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Ink box of converted artwork.
 *
 * Every element this converter emits carries an exact `x`/`y`/`width`/`height`
 * derived from its own absolute point extents, and `strokeColor` is always
 * transparent (see ARCHITECTURE.md §3), so a plain union of those rectangles
 * *is* the ink box - there is no stroke extent to add back.
 *
 * Returns `null` for an empty scene so callers can tell "no artwork" apart
 * from "artwork of zero size" and fall back to the nominal box.
 */
export function elementsBounds(elements: ExcalidrawElement[]): Bounds | null {
  const corners: Array<[number, number]> = [];
  for (const el of elements) {
    if (el.isDeleted) continue;
    corners.push([el.x, el.y], [el.x + el.width, el.y + el.height]);
  }

  const { minX, minY, maxX, maxY } = boundsOf(corners);
  if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) return null;

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Size and internal offsets of one item, independent of where it is placed.
 *
 * Split out of `createExcalidrawItem` so the grid packers can ask how big an
 * item is *before* choosing its position. They used to assume a fixed 160/180
 * unit pitch, which silently overlapped neighbours as soon as a card grew -
 * long service names and any `iconScale` above 1 both did it.
 *
 * `artworkSize` overrides the nominal `ICON_BASE_SIZE * iconScale` square, and
 * is how `fitFrame` works: the caller converts first, measures the real ink,
 * and passes it back in. Left out, the result is the nominal layout - which is
 * what `gridPitch` wants, and what keeps this callable from a filename alone.
 */
export function measureExcalidrawItem(
  icon: IconAsset,
  options: ExcalidrawOptions,
  artworkSize?: { width: number; height: number }
): ItemLayout {
  const nominal = Math.round(ICON_BASE_SIZE * options.iconScale);
  const iconWidth = artworkSize ? artworkSize.width : nominal;
  const iconHeight = artworkSize ? artworkSize.height : nominal;
  const padding = options.showCard ? options.padding : 0;

  // Measured against the real font's advance widths rather than estimated from
  // the character count. Excalidraw does not re-measure pasted text, so the
  // number written here is the one the card is sized around forever.
  const label = options.showLabel
    ? measureLabel(icon.title, options.labelFontFamily, options.labelFontSize)
    : { width: 0, height: 0 };
  const labelWidth = label.width;
  const labelHeight = label.height;

  let cardWidth: number;
  let cardHeight: number;
  let iconDx: number;
  let iconDy: number;
  let labelDx: number;
  let labelDy: number;

  if (options.labelPosition === 'right') {
    const gap = options.showLabel ? LABEL_GAP_BESIDE : 0;
    cardWidth = iconWidth + (options.showLabel ? labelWidth + gap : 0) + padding * 2;
    cardHeight = Math.max(iconHeight, labelHeight) + padding * 2;
    iconDx = padding;
    iconDy = (cardHeight - iconHeight) / 2;
    labelDx = padding + iconWidth + gap;
    labelDy = (cardHeight - labelHeight) / 2;
  } else if (options.labelPosition === 'top') {
    const gap = options.showLabel ? LABEL_GAP_STACKED : 0;
    cardWidth = Math.max(iconWidth, labelWidth) + padding * 2;
    cardHeight = iconHeight + padding * 2 + (options.showLabel ? labelHeight + gap : 0);
    labelDx = (cardWidth - labelWidth) / 2;
    labelDy = padding;
    iconDx = (cardWidth - iconWidth) / 2;
    iconDy = padding + (options.showLabel ? labelHeight + gap : 0);
  } else {
    const gap = options.showLabel ? LABEL_GAP_STACKED : 0;
    cardWidth = Math.max(iconWidth, labelWidth) + padding * 2;
    cardHeight = iconHeight + padding * 2 + (options.showLabel ? labelHeight + gap : 0);
    iconDx = (cardWidth - iconWidth) / 2;
    iconDy = padding;
    labelDx = (cardWidth - labelWidth) / 2;
    labelDy = padding + iconHeight + gap;
  }

  return {
    cardWidth,
    cardHeight,
    iconWidth,
    iconHeight,
    labelWidth,
    labelHeight,
    iconDx,
    iconDy,
    labelDx,
    labelDy,
  };
}

/** Grows a box to the nearest whole units on every side. */
function snapOutward(bounds: Bounds | null): Bounds | null {
  if (!bounds) return null;

  const x = Math.floor(bounds.x);
  const y = Math.floor(bounds.y);

  return {
    x,
    y,
    width: Math.ceil(bounds.x + bounds.width) - x,
    height: Math.ceil(bounds.y + bounds.height) - y,
  };
}

/**
 * The box a frame is sized around, or `null` to use the nominal icon square.
 *
 * Exported because the grid preview needs the identical answer. The preview
 * has already converted the icon in order to render it, so it can measure the
 * same ink the exporter will - but only if it measures it the *same way*.
 * Reimplementing "bounds, snapped outward" on the UI side is how a preview
 * starts disagreeing with its export by a unit or two under `fitFrame`.
 *
 * Snapped outward rather than rounded: ink bounds are arbitrary floats, and
 * feeding them straight into the layout produced cards like 96.06 x 127.01,
 * which made every derived offset fractional and pushed the artwork half a
 * unit off centre once positions were rounded. Expanding guarantees the frame
 * still contains all of the ink.
 */
export function inkBoxFor(
  elements: ExcalidrawElement[],
  options: ExcalidrawOptions
): Bounds | null {
  if (!options.fitFrame) return null;
  return snapOutward(elementsBounds(elements));
}

/** Shifts elements in place. */
export function translateElements(
  elements: ExcalidrawElement[],
  dx: number,
  dy: number
): void {
  if (dx === 0 && dy === 0) return;
  for (const el of elements) {
    el.x += dx;
    el.y += dy;
  }
}
