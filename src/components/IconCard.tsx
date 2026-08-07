import React from 'react';
import { Check } from 'lucide-react';
import { IconAsset, ExcalidrawOptions, ExcalidrawElement } from '../types';
import {
  buildExcalidrawClipboardData,
  parseSvgToExcalidrawElements,
} from '../utils/excalidrawGenerator';
import { ICON_BASE_SIZE } from '../utils/defaultOptions';
import { ExcalidrawPreview } from './ExcalidrawPreview';
import confetti from 'canvas-confetti';

interface IconCardProps {
  icon: IconAsset;
  isSelected: boolean;
  isSelectionMode: boolean;
  onToggleSelect: (id: string) => void;
  options: ExcalidrawOptions;
  onToast: (message: string) => void;
}

/**
 * Largest icon the grid will draw at true size.
 *
 * At `iconScale: 2` an icon is 192 canvas units, which would force ~230px grid
 * cells and drop the grid to three columns. The card shows it scaled to fit
 * and states the real export size in the caption, so the number is never
 * implied by the picture alone.
 */
const MAX_PREVIEW_PX = 112;

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

const IconCardImpl: React.FC<IconCardProps> = ({
  icon,
  isSelected,
  isSelectionMode,
  onToggleSelect,
  options,
  onToast,
}) => {
  const [copied, setCopied] = React.useState(false);

  const exportPx = Math.round(ICON_BASE_SIZE * options.iconScale);
  const previewPx = Math.min(exportPx, MAX_PREVIEW_PX);

  // The card previews the *converted* scene, not the source file. Showing the
  // input was a credibility gap on a product whose entire claim is conversion
  // fidelity, and a CSS mock cannot represent roughness at all - a sketch-mode
  // export looked identical to a clean one.
  const elements = React.useMemo(
    () => convertIcon(icon, exportPx, options.roughness),
    [icon, exportPx, options.roughness]
  );

  const frame = React.useMemo(
    () => ({ x: 0, y: 0, width: exportPx, height: exportPx }),
    [exportPx]
  );

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

  const fontFamilyCss =
    options.labelFontFamily === 1
      ? "'Excalifont', 'Kalam', cursive"
      : options.labelFontFamily === 3
      ? "'Comic Shanns', 'JetBrains Mono', monospace"
      : options.labelFontFamily === 4
      ? "'Lilita One', cursive"
      : options.labelFontFamily === 5
      ? "'Nunito', sans-serif"
      : "'Helvetica', 'Inter', sans-serif";

  return (
    <div
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

      <div
        className="icon-preview-box"
        style={{
          backgroundColor: options.showCard ? options.cardBgColor : 'transparent',
          borderWidth: options.showCard && options.cardStyle !== 'none' ? '1px' : '0px',
          borderStyle: options.cardStyle === 'sketch-box' ? 'dashed' : 'solid',
          borderColor: options.cardStrokeColor,
          borderRadius:
            options.showCard && (options.cardStyle === 'soft-card' || options.cardStyle === 'badge')
              ? '12px'
              : '0px',
          padding: options.showCard ? `${options.padding}px` : '0px',
          flexDirection:
            options.labelPosition === 'right'
              ? 'row'
              : options.labelPosition === 'top'
              ? 'column-reverse'
              : 'column',
        }}
      >
        <div style={{ width: `${previewPx}px`, height: `${previewPx}px` }}>
          <ExcalidrawPreview elements={elements} label={icon.title} frame={frame} />
        </div>

        {options.showLabel && (
          <span
            className="icon-title-text"
            style={{
              fontSize: `${options.labelFontSize}px`,
              color: options.labelColor,
              fontFamily: fontFamilyCss,
            }}
          >
            {icon.title}
          </span>
        )}
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
