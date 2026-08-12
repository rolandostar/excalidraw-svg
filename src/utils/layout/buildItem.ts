/**
 * One icon, converted and laid out: frame, artwork, label.
 *
 * Its own module because it is the only thing that spans both halves of this
 * folder - it calls the converter, then the measurer, then places what came
 * back - and because the five numbered steps below are the whole contract
 * between them.
 */
import type { IconAsset } from '../../types/icons';
import type { ExcalidrawOptions } from '../../types/options';
import type { ExcalidrawElement, ExcalidrawFile } from '../../types/excalidraw';
import { ICON_BASE_SIZE } from '../defaultOptions';
import { lineHeightFor } from '../textMetrics';
import { createBaseElement, generateRandomId } from '../convert/emit';
import { parseSvgToExcalidrawElements } from '../convert/parseSvg';
import { inkBoxFor, measureExcalidrawItem, translateElements } from './itemLayout';

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
