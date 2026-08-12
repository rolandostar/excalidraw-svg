import React from 'react';
import type { IconAsset } from '../../types/icons';
import type { ExcalidrawOptions } from '../../types/options';
import type { ExcalidrawElement } from '../../types/excalidraw';
import { inkBoxFor, measureExcalidrawItem } from '../../utils/layout';
import { fontFamilyCss, lineHeightFor } from '../../utils/textMetrics';
import { STAGE_HEIGHT_PX, cardScaleFor } from '../gridMetrics';
import { ExcalidrawPreview } from '../ExcalidrawPreview';
import { useFrameStyle } from './frameStyle';

/**
 * What one exported item will look like, drawn at the scale the grid has room
 * for.
 *
 * Everything here is geometry: where the artwork and the label sit inside the
 * card, and how far the whole thing has to shrink to fit its column. The card
 * around it - selection, keyboard handling, copying - is `IconCard`.
 */
interface IconPreviewProps {
  icon: IconAsset;
  options: ExcalidrawOptions;
  /** `null` until the card has been near the viewport; see `useHasBeenVisible`. */
  elements: ExcalidrawElement[] | null;
  /** Nominal artwork edge, in export units. */
  exportPx: number;
  stageWidth: number;
}

export function IconPreview({
  icon,
  options,
  elements,
  exportPx,
  stageWidth,
}: IconPreviewProps) {
  /*
   * The exporter's own layout, not a lookalike.
   *
   * This used to be a flexbox arrangement that guessed `flex-direction` from
   * `labelPosition` and shared no code with `measureExcalidrawItem`. It could
   * not be correct, and for `labelPosition: 'right'` it was visibly wrong: the
   * artwork was a flex item wrapping an SVG, so its min-content width was zero
   * and it collapsed to a sliver, while the label - squeezed below one word's
   * width - broke mid-word into "Collaboratio / n".
   *
   * Driving the preview from the same function the exporter calls makes the
   * two agree by construction instead of by maintenance.
   */
  const ink = React.useMemo(
    () => (elements ? inkBoxFor(elements, options) : null),
    [elements, options]
  );

  const layout = React.useMemo(
    () => measureExcalidrawItem(icon, options, ink ?? undefined),
    [icon, options, ink]
  );

  // Scales the whole card, preserving the export's real proportions. See
  // `cardScaleFor` for why an extremely wide card overflows rather than
  // shrinking to fit.
  const { scale, isClipped } = cardScaleFor(layout.cardWidth, layout.cardHeight, stageWidth);

  /*
   * Frame the export on the artwork slot the layout just assigned.
   *
   * Under `fitFrame` that is the ink box, so the artwork fills its slot exactly
   * instead of being letterboxed inside the nominal square it no longer
   * occupies.
   *
   * REQUIRED, not an optimisation: this object is compared by identity by
   * `ExcalidrawPreview`'s memo and by its export effect's dependency list, so
   * a fresh literal here re-runs `exportToSvg` for all 216 cards on every tick
   * of an unrelated slider.
   */
  const frame = React.useMemo(
    () =>
      ink
        ? { x: ink.x, y: ink.y, width: ink.width, height: ink.height }
        : { x: 0, y: 0, width: exportPx, height: exportPx },
    [ink, exportPx]
  );

  const frameStyle = useFrameStyle(options);

  return (
    /*
      The stage is a fixed box; the card inside it carries the export's real
      unit dimensions and is scaled to fit. Sizing in export units and then
      scaling - rather than laying the parts out in CSS pixels - is what
      keeps the proportions honest for a 400 x 144 side-label card.
    */
    <div
      className={`icon-preview-stage${isClipped ? ' is-clipped' : ''}`}
      style={{ height: `${STAGE_HEIGHT_PX}px` }}
    >
      <div
        className="icon-preview-card"
        style={{
          ...frameStyle,
          width: `${layout.cardWidth}px`,
          height: `${layout.cardHeight}px`,
          // Centred here rather than by the stage; see `.icon-preview-card`.
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        <div
          className="icon-preview-art"
          style={{
            left: `${layout.iconDx}px`,
            top: `${layout.iconDy}px`,
            width: `${layout.iconWidth}px`,
            height: `${layout.iconHeight}px`,
          }}
        >
          {elements && <ExcalidrawPreview elements={elements} label={icon.title} frame={frame} />}
        </div>

        {options.showLabel && (
          <span
            className="icon-title-text"
            style={{
              left: `${layout.labelDx}px`,
              top: `${layout.labelDy}px`,
              width: `${layout.labelWidth}px`,
              height: `${layout.labelHeight}px`,
              fontSize: `${options.labelFontSize}px`,
              lineHeight: lineHeightFor(options.labelFontFamily),
              color: options.labelColor,
              fontFamily: fontFamilyCss(options.labelFontFamily),
            }}
          >
            {icon.title}
          </span>
        )}
      </div>
    </div>
  );
}
