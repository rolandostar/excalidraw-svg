import type { ExcalidrawElement, ExcalidrawFile, ExcalidrawLibraryPackage } from '../types/excalidraw';
import type { ExcalidrawOptions } from '../types/options';
import type { IconAsset } from '../types/icons';
import { ICON_BASE_SIZE } from './options';
import { boundsOf } from '../convert/geometry';
import { lineHeightFor, measureLabel } from './text';
import { createBaseElement, generateRandomId } from '../convert/emit';
import { parseSvgToExcalidrawElements } from '../convert/parseSvg';

/**
 * Arranging converted artwork into something you can paste.
 *
 * Three stages, in the order they run, because each needs the previous one's
 * output and nothing else needs any of them:
 *
 *   measure   how big one item is, before it has been converted
 *   build     the elements for one item: artwork, card, label
 *   pack      many items on a grid, and the two package formats
 */

// ---------------------------------------------------------------------------
// Measure
// ---------------------------------------------------------------------------

/**
 * How big one item is and where its parts sit inside it - measured, never
 * assumed.
 */

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
 * transparent (see the Architecture wiki page), so a plain union of those rectangles
 * *is* the ink box - there is no stroke extent to add back.
 *
 * Returns `null` for an empty scene so callers can tell "no artwork" apart
 * from "artwork of zero size" and fall back to the nominal box.
 */
function elementsBounds(elements: ExcalidrawElement[]): Bounds | null {
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
 * Split out of `createExcalidrawItem` so a caller can ask how big an item is
 * *before* choosing its position. A fixed pitch overlaps neighbours as soon
 * as a card grows, which long service names and any `iconScale` above 1 both
 * do.
 *
 * `artworkSize` overrides the nominal `ICON_BASE_SIZE * iconScale` square and
 * is how `fitFrame` works: the caller converts first, measures the real ink,
 * and passes it back in. Left out, the result is the nominal layout, which is
 * computable from a filename alone.
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

  // Exact advance widths, not a character-count estimate: see textMetrics.ts.
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

function translateElements(
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

/**
 * One icon, converted and laid out: frame, artwork, label.
 */

export function createExcalidrawItem(
  icon: IconAsset,
  options: ExcalidrawOptions,
  baseX = 0,
  baseY = 0
): { elements: ExcalidrawElement[]; files: Record<string, ExcalidrawFile> } {
  const elements: ExcalidrawElement[] = [];
  const files: Record<string, ExcalidrawFile> = {};
  const groupId = generateRandomId();

  const nominalSize = Math.round(ICON_BASE_SIZE * options.iconScale);

  // 1. Convert the artwork first, at the origin.
  //
  // The layout depends on the result when `fitFrame` is on, so this has to run
  // before anything is measured or placed. It is still exactly one conversion
  // per item: the elements are translated into position afterwards rather than
  // being re-converted at an offset.
  //
  // An embedded image is the last resort, not a user-selectable mode: a bitmap
  // is not editable, not restyleable and not what this project is for. It
  // survives purely so a file the converter cannot handle still pastes as
  // *something* visible rather than vanishing.
  const vectorElements = parseSvgToExcalidrawElements(
    icon.rawSvg,
    { x: 0, y: 0, width: nominalSize, height: nominalSize },
    { groupId, roughness: options.iconRoughness }
  );

  /*
   * 2. Decide what the frame is being sized around.
   *
   * The nominal box is the source viewBox scaled to fit, so it includes any
   * padding the author baked into the file, and letterboxes anything that is
   * not square (`parseSvgToExcalidrawElements` fits with `Math.min` of the two
   * ratios and centres). That dead space is the gap between "the icon is
   * accurate" and "the frame is not".
   *
   * `fitFrame` closes it by measuring the ink that was actually produced. The
   * artwork itself is untouched - same conversion, same scale, same fidelity -
   * only the box drawn around it changes.
   */
  const ink = inkBoxFor(vectorElements, options);
  const artwork = ink
    ? { width: ink.width, height: ink.height }
    : { width: nominalSize, height: nominalSize };

  const layout = measureExcalidrawItem(icon, options, artwork);
  const { cardWidth, cardHeight, labelWidth, labelHeight } = layout;
  const labelText = icon.title;

  const iconX = Math.round(baseX + layout.iconDx);
  const iconY = Math.round(baseY + layout.iconDy);
  const labelX = Math.round(baseX + layout.labelDx);
  const labelY = Math.round(baseY + layout.labelDy);

  // 3. Frame rectangle.
  //
  // Every property is taken from the options rather than implied by a named
  // style. In particular `backgroundColor` is applied unconditionally: the old
  // `outline` style forced it to transparent, so the background swatch did
  // nothing whenever outline was selected.
  if (options.showCard) {
    elements.push(
      createBaseElement(
        'rectangle',
        { x: baseX, y: baseY, width: cardWidth, height: cardHeight },
        groupId,
        {
          index: 'a0',
          strokeColor: options.cardStrokeColor,
          backgroundColor: options.cardBgColor,
          fillStyle: options.cardFillStyle,
          strokeWidth: options.cardStrokeWidth,
          roughness: options.cardRoughness,
          // Excalidraw's `getCornerRadius` gives `shorterSide * 0.25` below 128
          // units, which is the rounding people expect from a card.
          roundness: options.cardCorners === 'rounded' ? { type: 3 } : null,
        }
      )
    );
  }

  // 4. Artwork, moved into place.
  if (vectorElements.length > 0) {
    // Under `fitFrame` the ink box is what was positioned, so the offset is
    // measured from the ink's own origin rather than from the nominal box.
    translateElements(vectorElements, iconX - (ink?.x ?? 0), iconY - (ink?.y ?? 0));
    elements.push(...vectorElements);
  } else {
    const fileId = generateRandomId();
    files[fileId] = { mimeType: 'image/svg+xml', id: fileId, dataURL: icon.dataUrl, created: Date.now() };

    elements.push(
      createBaseElement(
        'image',
        { x: iconX, y: iconY, width: artwork.width, height: artwork.height },
        groupId,
        {
          fileId,
          scale: [1, 1],
          status: 'saved',
        }
      )
    );
  }

  // 5. Label.
  if (options.showLabel) {
    elements.push(
      createBaseElement(
        'text',
        { x: labelX, y: labelY, width: labelWidth, height: labelHeight },
        groupId,
        {
          index: 'a2',
          strokeColor: options.labelColor,
          text: labelText,
          originalText: labelText,
          fontSize: options.labelFontSize,
          fontFamily: options.labelFontFamily,
          textAlign: 'center',
          verticalAlign: 'top',
          containerId: null,
          // This font's real line height, not a constant. `restoreElement` only
          // back-solves one from the supplied height when the field is absent, and
          // its guess disagrees with the font for everything except Excalifont.
          lineHeight: lineHeightFor(options.labelFontFamily),
        }
      )
    );
  }

  return { elements, files };
}

/**
 * Laying many items out on a grid, and the two package formats that carry the
 * result out of the app.
 */

interface PackedItem {
  icon: IconAsset;
  elements: ExcalidrawElement[];
  files: Record<string, ExcalidrawFile>;
}

/**
 * Builds every item and lays them out on a grid sized to what they measure.
 *
 * Two passes over one conversion each: build at the origin, take each item's
 * real extent, then translate into a cell. The pitch has to come from the
 * built items: `fitFrame` sizes the frame from ink, and source artwork is not
 * clipped to its own `viewBox`, so a file that draws outside it
 * (`Iot-Edge.svg` does, by 12 units) is larger than any measurement taken
 * before conversion can predict.
 *
 * Cells are aligned on each item's measured bounds rather than on its
 * nominal origin, so the escaping case is centred in its cell instead of
 * hanging out of one corner. For the 259 icons that stay inside their viewBox
 * the two are the same point and nothing moves.
 */
function packGrid(
  icons: IconAsset[],
  options: ExcalidrawOptions,
  gutter: number,
  columns: number
): PackedItem[] {
  const built = icons.map(icon => ({ icon, ...createExcalidrawItem(icon, options, 0, 0) }));
  const boxes = built.map(item => elementsBounds(item.elements));

  let widest = 0;
  let tallest = 0;
  for (const box of boxes) {
    if (!box) continue;
    if (box.width > widest) widest = box.width;
    if (box.height > tallest) tallest = box.height;
  }

  const pitchX = Math.ceil(widest) + gutter;
  const pitchY = Math.ceil(tallest) + gutter;

  built.forEach((item, idx) => {
    const box = boxes[idx];
    if (!box) return;
    const col = idx % columns;
    const row = Math.floor(idx / columns);
    translateElements(item.elements, col * pitchX - box.x, row * pitchY - box.y);
  });

  return built;
}

export function buildExcalidrawLibraryPackage(
  icons: IconAsset[],
  options: ExcalidrawOptions
): ExcalidrawLibraryPackage {
  const allFiles: Record<string, ExcalidrawFile> = {};

  const libraryItems = packGrid(icons, options, 32, 10).map(({ icon, elements, files }) => {
    // `files` used to be discarded here. When vector conversion yields nothing,
    // `createExcalidrawItem` falls back to an `image` element whose bitmap
    // lives in `files` - dropping the map left a library item pointing at a
    // `fileId` that does not exist, which Excalidraw renders as an empty box.
    Object.assign(allFiles, files);

    return {
      id: generateRandomId(),
      status: 'published' as const,
      created: Date.now(),
      name: icon.title,
      elements,
      ...(Object.keys(files).length > 0 ? { files } : {}),
    };
  });

  // Carried both per-item and at the top level: the `.excalidrawlib` v2 schema
  // is not explicit about where files belong, and different Excalidraw builds
  // have looked in either place.
  return {
    type: 'excalidrawlib',
    version: 2,
    libraryItems,
    ...(Object.keys(allFiles).length > 0 ? { files: allFiles } : {}),
  };
}

export function buildExcalidrawClipboardData(
  icons: IconAsset[],
  options: ExcalidrawOptions
): { jsonText: string; excalidrawClipboardJson: string } {
  let allElements: ExcalidrawElement[] = [];
  const allFiles: Record<string, ExcalidrawFile> = {};

  for (const { elements, files } of packGrid(icons, options, 24, 8)) {
    allElements = allElements.concat(elements);
    Object.assign(allFiles, files);
  }

  const payload = {
    type: 'excalidraw/clipboard',
    elements: allElements,
    files: allFiles,
  };

  return {
    jsonText: JSON.stringify(payload, null, 2),
    excalidrawClipboardJson: JSON.stringify(payload),
  };
}
