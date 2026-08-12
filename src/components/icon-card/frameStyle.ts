import React from 'react';
import type { ExcalidrawOptions } from '../../types/options';

/**
 * The CSS mock of the card rectangle Excalidraw will draw.
 *
 * Pure presentation, and the only part of the preview that is an
 * *approximation* rather than the exporter's own output - so it is worth
 * having on its own where the gap between it and the real thing can be stated
 * in one place.
 */

/**
 * CSS stand-in for a Rough.js hachure or cross-hatch fill.
 *
 * Rough.js hatches by stroking parallel lines *in the background colour* at
 * roughly 45 degrees. Excalidraw asks it for a gap of `strokeWidth * 4`, so
 * the 5px period below is about right for a default hairline frame, and the
 * card is drawn in export units so it scales with everything else.
 *
 * The point is only to make the three fill styles distinguishable at a glance
 * in the grid. The strokes are perfectly straight where Rough.js's wander, and
 * roughness is not represented at all.
 */
function hatchGradient(color: string, crossed: boolean): string {
  const band = `${color} 0 1px, transparent 1px 5px`;
  const forward = `repeating-linear-gradient(45deg, ${band})`;
  return crossed ? `${forward}, repeating-linear-gradient(-45deg, ${band})` : forward;
}

/**
 * CSS approximation of the exported frame rectangle.
 *
 * Tracks the export: the rectangle is positioned and sized by
 * `measureExcalidrawItem`, including under `fitFrame`, and hachure and
 * cross-hatch are repeating gradients over the *fill* - they hatch the
 * interior, not the border.
 *
 * Roughness is the one thing CSS cannot do, so a sketchy frame only looks
 * sketchy once pasted.
 */
export function useFrameStyle(options: ExcalidrawOptions): React.CSSProperties {
  return React.useMemo((): React.CSSProperties => {
    if (!options.showCard) {
      return { backgroundColor: 'transparent', borderWidth: 0, borderStyle: 'solid' };
    }

    const hatch =
      options.cardFillStyle !== 'solid' && options.cardBgColor !== 'transparent'
        ? hatchGradient(options.cardBgColor, options.cardFillStyle === 'cross-hatch')
        : undefined;

    return {
      // Applied unconditionally, matching the export, so the background
      // swatch always does something.
      backgroundColor: hatch ? 'transparent' : options.cardBgColor,
      backgroundImage: hatch,
      borderWidth: `${options.cardStrokeWidth}px`,
      borderStyle: 'solid',
      borderColor: options.cardStrokeColor,
      // Excalidraw uses shorterSide * 0.25 below 128 units; 12px is the
      // closest fixed value for a default-sized card.
      borderRadius: options.cardCorners === 'rounded' ? '12px' : '0px',
    };
  }, [
    options.showCard,
    options.cardCorners,
    options.cardStrokeWidth,
    options.cardFillStyle,
    options.cardBgColor,
    options.cardStrokeColor,
  ]);
}
