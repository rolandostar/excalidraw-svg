import React from 'react';
import { Check } from 'lucide-react';
import type { ExcalidrawElement } from '../types/excalidraw';
import type { ExcalidrawOptions } from '../types/options';
import type { IconAsset } from '../types/icons';
import { ICON_BASE_SIZE } from '../utils/defaultOptions';
import { fontFamilyCss, lineHeightFor } from '../utils/textMetrics';
import { inkBoxFor, measureExcalidrawItem, buildExcalidrawClipboardData } from '../utils/layout';
import { parseSvgToExcalidrawElements } from '../utils/convert/parseSvg';
import { getCachedScene, sceneCacheKey, setCachedScene } from '../utils/sceneCache';
import { celebrate } from '../utils/celebrate';
import { useClipboardCopy, useHasBeenVisible } from '../hooks';
import { ExcalidrawPreview } from './ExcalidrawPreview';
import { STAGE_HEIGHT_PX, cardScaleFor } from './gridMetrics';
import { useToast } from './Toast';

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

/**
 * One icon in the grid: a CSS mock of the exported frame, the converted
 * artwork, and the click that copies it.
 *
 *   frame     CSS approximation of the exported rectangle
 *   preview   the stage, scaled so the mock matches what will be pasted
 *   card      conversion, caching, and the copy interaction
 */

// ---------------------------------------------------------------------------
// Frame mock
// ---------------------------------------------------------------------------

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
function useFrameStyle(options: ExcalidrawOptions): React.CSSProperties {
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

// ---------------------------------------------------------------------------
// Preview stage
// ---------------------------------------------------------------------------

function IconPreview({
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

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

/**
 * One tile in the icon grid: the preview, plus everything that makes it a
 * control.
 *
 * Owns the interaction - click to copy, click to select, the keyboard
 * equivalents and the accessible names for both modes - and the decision about
 * *whether* to convert at all. The geometry of what is drawn is `IconPreview`.
 */
interface IconCardProps {
  icon: IconAsset;
  isSelected: boolean;
  isSelectionMode: boolean;
  onToggleSelect: (id: string) => void;
  options: ExcalidrawOptions;
  /**
   * Exact width available to the card, measured from the real grid column.
   *
   * Passed down rather than measured here: the scale factor needs a width, and
   * 216 `ResizeObserver`s would cost more than the layout they are watching.
   * `IconGrid` runs one for the whole grid.
   */
  stageWidth: number;
}

/** Converts an icon once per (size, roughness), reusing `sceneCache` after that. */
function convertIcon(icon: IconAsset, exportPx: number, roughness: number): ExcalidrawElement[] {
  const key = sceneCacheKey(icon.id, exportPx, roughness);
  const hit = getCachedScene(key);
  if (hit) return hit;

  const elements = parseSvgToExcalidrawElements(
    icon.rawSvg,
    { x: 0, y: 0, width: exportPx, height: exportPx },
    { groupId: `card_${icon.id}`, roughness }
  );

  setCachedScene(key, elements);
  return elements;
}

const IconCardImpl: React.FC<IconCardProps> = ({
  icon,
  isSelected,
  isSelectionMode,
  onToggleSelect,
  options,
  stageWidth,
}) => {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const onToast = useToast();

  const { copied, copy } = useClipboardCopy({
    onSuccess: () => {
      celebrate(25);
      onToast(`${icon.title} copied — paste into Excalidraw with Ctrl+V`);
    },
    onError: onToast,
  });

  /**
   * Convert and export only what the user might actually be looking at.
   *
   * A set is 216 cards and a viewport holds about twenty. Doing the work for
   * all of them on mount cost one SVG conversion and one Excalidraw export per
   * card, on the main thread, before anything could be interacted with. The
   * stage is a fixed box sized from the grid rather than from its contents, so
   * deferring the artwork does not move the layout and cannot make the
   * observer oscillate.
   */
  const isVisible = useHasBeenVisible(cardRef);

  const exportPx = Math.round(ICON_BASE_SIZE * options.iconScale);

  // The card previews the *converted* scene, not the source file. Showing the
  // input was a credibility gap on a product whose entire claim is conversion
  // fidelity, and a CSS mock cannot represent roughness at all - a sketch-mode
  // export looked identical to a clean one.
  //
  // REQUIRED, not an optimisation. `elements` reaches `ExcalidrawPreview`,
  // which compares it by identity and lists it as an effect dependency; a
  // fresh array here re-runs `exportToSvg` for all 216 cards on every tick of
  // an unrelated slider.
  const elements = React.useMemo(
    () => (isVisible ? convertIcon(icon, exportPx, options.iconRoughness) : null),
    [isVisible, icon, exportPx, options.iconRoughness]
  );

  const activate = () => {
    if (isSelectionMode) onToggleSelect(icon.id);
    // Serialised lazily: building the clipboard payload is a full export, and
    // in selection mode it is never needed.
    else void copy(() => buildExcalidrawClipboardData([icon], options).jsonText);
  };

  return (
    <div
      ref={cardRef}
      className={`icon-card ${isSelected ? 'selected' : ''} ${copied ? 'copied-flash' : ''}`}
      onClick={activate}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      }}
      role={isSelectionMode ? 'checkbox' : 'button'}
      aria-checked={isSelectionMode ? isSelected : undefined}
      aria-label={
        isSelectionMode
          ? `${icon.title}, ${isSelected ? 'selected' : 'not selected'}`
          : `Copy ${icon.title} to clipboard`
      }
      tabIndex={0}
    >
      {copied && (
        <div className="copy-toast">
          <Check size={13} />
          <span>Copied</span>
        </div>
      )}

      {(isSelectionMode || isSelected) && (
        <div className="checkbox-container">
          <div className="checkbox-custom">{isSelected && <Check size={12} color="#fff" />}</div>
        </div>
      )}

      <IconPreview
        icon={icon}
        options={options}
        elements={elements}
        exportPx={exportPx}
        stageWidth={stageWidth}
      />

      {!options.showLabel && (
        <div className="icon-ui-caption">
          <span className="subtle-caption-text">{icon.title}</span>
        </div>
      )}
    </div>
  );
};

/**
 * Memoised because the grid renders 216 of these and the sidebar sits above
 * them: without this, toggling a single checkbox or moving one slider one step
 * re-rendered every card in the set.
 */
export const IconCard = React.memo(IconCardImpl);
