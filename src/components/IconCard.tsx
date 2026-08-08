import React from 'react';
import { Check } from 'lucide-react';
import { IconAsset, ExcalidrawOptions, ExcalidrawElement } from '../types';
import {
  buildExcalidrawClipboardData,
  parseSvgToExcalidrawElements,
} from '../utils/excalidrawGenerator';
import { ICON_BASE_SIZE } from '../utils/defaultOptions';
import { IconPreview } from './icon-card/IconPreview';
import { useHasBeenVisible } from '../hooks/useHasBeenVisible';
import { useClipboardCopy } from '../hooks/useClipboardCopy';
import { useToast } from './Toast';
import { celebrate } from '../utils/celebrate';
import { getCachedScene, sceneCacheKey, setCachedScene } from '../utils/sceneCache';

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
