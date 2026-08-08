import React from 'react';
import { Check } from 'lucide-react';
import { IconAsset, ExcalidrawOptions, ExcalidrawElement } from '../types';
import {
  buildExcalidrawClipboardData,
  inkBoxFor,
  measureExcalidrawItem,
  parseSvgToExcalidrawElements,
} from '../utils/excalidrawGenerator';
import { ICON_BASE_SIZE } from '../utils/defaultOptions';
import { STAGE_HEIGHT_PX, cardScaleFor } from './gridMetrics';
import { fontFamilyCss, lineHeightFor } from '../utils/textMetrics';
import { ExcalidrawPreview } from './ExcalidrawPreview';
import { useHasBeenVisible } from '../hooks/useHasBeenVisible';
import confetti from 'canvas-confetti';

interface IconCardProps {
  icon: IconAsset;
  isSelected: boolean;
  isSelectionMode: boolean;
  onToggleSelect: (id: string) => void;
  options: ExcalidrawOptions;
  onToast: (message: string) => void;
  /**
   * Exact width available to the card, measured from the real grid column.
   *
   * Passed down rather than measured here: the scale factor needs a width, and
   * 216 `ResizeObserver`s would cost more than the layout they are watching.
   * `IconGrid` runs one for the whole grid.
   */
  stageWidth: number;
}

/**
 * Conversion results, keyed by everything that can change them.
 *
 * `parseSvgToExcalidrawElements` runs a DOMParser, flattens every Bezier and
 * then does polygon booleans for clips and masks. Multiplied by 216 cards it
 * is the single most expensive thing on the page, and the icon-scale slider
 * invalidates all of them at once. A per-card `useMemo` cannot help there
 * because dragging back to a previous value re-does the work from scratch.
 *
 * Bounded so a long drag across the whole slider range cannot grow without
 * limit; the map is insertion-ordered, so the oldest key is the first one.
 */
const MAX_CACHED_SCENES = 900;
const sceneCache = new Map<string, ExcalidrawElement[]>();

function convertIcon(
  icon: IconAsset,
  exportPx: number,
  roughness: number
): ExcalidrawElement[] {
  const key = `${icon.id}|${exportPx}|${roughness}`;
  const hit = sceneCache.get(key);
  if (hit) return hit;

  const elements = parseSvgToExcalidrawElements(
    icon.rawSvg,
    0,
    0,
    exportPx,
    exportPx,
    `card_${icon.id}`,
    roughness
  );

  if (sceneCache.size >= MAX_CACHED_SCENES) {
    sceneCache.delete(sceneCache.keys().next().value as string);
  }
  sceneCache.set(key, elements);
  return elements;
}

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

const IconCardImpl: React.FC<IconCardProps> = ({
  icon,
  isSelected,
  isSelectionMode,
  onToggleSelect,
  options,
  onToast,
  stageWidth,
}) => {
  const [copied, setCopied] = React.useState(false);

  const cardRef = React.useRef<HTMLDivElement>(null);

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
  const elements = React.useMemo(
    () => (isVisible ? convertIcon(icon, exportPx, options.iconRoughness) : null),
    [isVisible, icon, exportPx, options.iconRoughness]
  );

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
   */
  const frame = React.useMemo(
    () =>
      ink
        ? { x: ink.x, y: ink.y, width: ink.width, height: ink.height }
        : { x: 0, y: 0, width: exportPx, height: exportPx },
    [ink, exportPx]
  );

  /**
   * CSS approximation of the exported frame rectangle.
   *
   * One thing CSS still cannot do is Excalidraw's roughness, so a sketchy
   * frame only looks sketchy once pasted. Everything else now tracks the
   * export: the rectangle is positioned and sized by `measureExcalidrawItem`,
   * including under `fitFrame`, and hachure and cross-hatch are approximated
   * with repeating gradients over the fill. The previous mock drew those as a
   * dashed *border*, which described the wrong edge of the shape entirely.
   */
  const frameStyle = React.useMemo((): React.CSSProperties => {
    if (!options.showCard) {
      return { backgroundColor: 'transparent', borderWidth: 0, borderStyle: 'solid' };
    }

    const hatch =
      options.cardFillStyle !== 'solid' && options.cardBgColor !== 'transparent'
        ? hatchGradient(options.cardBgColor, options.cardFillStyle === 'cross-hatch')
        : undefined;

    return {
      // Applied unconditionally, matching the export. The old `outline` style
      // forced this to transparent, so the background swatch did nothing.
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

  const handleCopySingle = async () => {
    const { jsonText } = buildExcalidrawClipboardData([icon], options);
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      confetti({ particleCount: 25, spread: 40, origin: { y: 0.2 }, colors: ['#4285F4', '#34A853'] });
      onToast(`${icon.title} copied — paste into Excalidraw with Ctrl+V`);
    } catch {
      onToast('Could not access the clipboard.');
    }
  };

  const activate = () => {
    if (isSelectionMode) onToggleSelect(icon.id);
    else void handleCopySingle();
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

      {/*
        The stage is a fixed box; the card inside it carries the export's real
        unit dimensions and is scaled to fit. Sizing in export units and then
        scaling - rather than laying the parts out in CSS pixels - is what
        keeps the proportions honest for a 400 x 144 side-label card.
      */}
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
