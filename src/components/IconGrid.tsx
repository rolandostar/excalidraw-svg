import React from 'react';
import type { IconAsset } from '../types/icons';
import type { ExcalidrawOptions } from '../types/options';
import { IconCard } from './IconCard';
import type { IconSelection } from './IconsToolbar';
import { SearchX } from 'lucide-react';
import {
  CARD_PADDING_X,
  GRID_GAP_PX,
  MIN_TRACK_PX,
  columnCountFor,
  columnWidthFor,
} from './gridMetrics';

interface IconGridProps {
  icons: IconAsset[];
  /** Shared with the toolbar, which owns the controls that change it. */
  selection: IconSelection;
  options: ExcalidrawOptions;
  /** Narrowest a column may be, chosen for the current layout by `IconsPage`. */
  trackPx: number;
}

/**
 * Width of the grid, in CSS pixels, tracked with a single `ResizeObserver`.
 *
 * Every card needs to know how wide its column ended up so it can scale its
 * contents to fit. Measuring per card would mean 216 observers; measuring the
 * container once and dividing is the same answer for a fraction of the cost.
 */
function useMeasuredWidth(ref: React.RefObject<Element | null>): number {
  const [width, setWidth] = React.useState(0);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Older Safari and jsdom have no ResizeObserver. One static measurement is
    // still better than none: the grid only needs re-measuring on resize, and
    // a stale width shows cards slightly small rather than breaking them.
    if (typeof ResizeObserver === 'undefined') {
      setWidth(node.getBoundingClientRect().width);
      return;
    }

    const observer = new ResizeObserver(entries => {
      const next = entries[0]?.contentRect.width ?? 0;
      // Rounded before comparing: sub-pixel container widths would otherwise
      // set state on every scrollbar-induced reflow and re-render 216 cards.
      setWidth(prev => (Math.round(prev) === Math.round(next) ? prev : next));
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}

export const IconGrid: React.FC<IconGridProps> = ({ icons, selection, options, trackPx }) => {
  const { selectedIds, setSelectedIds, isSelectionMode } = selection;

  // Identity-stable, or `React.memo` on IconCard would never hold.
  const handleToggleSelect = React.useCallback(
    (id: string) => {
      setSelectedIds(prev => (prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]));
    },
    [setSelectedIds]
  );

  // `selectedIds.includes` inside the map was O(n^2) over 216 cards.
  const selected = React.useMemo(() => new Set(selectedIds), [selectedIds]);

  const gridRef = React.useRef<HTMLDivElement>(null);
  const gridWidth = useMeasuredWidth(gridRef);

  /*
   * The column count is computed rather than left to `auto-fill`.
   *
   * `repeat(auto-fill, minmax(track, 1fr))` stretches leftover space into every
   * column, so the real column width is not the track width - and a card that
   * scaled itself against the track would render smaller than the space it was
   * actually given. Deriving the count here means the exact width is known.
   */
  const columns = columnCountFor(gridWidth, trackPx);
  const columnWidth = columnWidthFor(gridWidth, columns);

  // Before the first measurement there is no width to divide, so cards fall
  // back to the track. They correct on the observer's first callback, which
  // fires before paint.
  const stageWidth = Math.max(
    64,
    (gridWidth > 0 ? columnWidth : trackPx) - CARD_PADDING_X
  );

  if (icons.length === 0) {
    return (
      <div
        className="glass-panel"
        style={{
          padding: '4rem 2rem',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
          color: 'var(--text-secondary)',
        }}
      >
        <SearchX size={44} aria-hidden="true" />
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          No GCP icons match your filter
        </h3>
        <p style={{ fontSize: '0.85rem' }}>
          Try clearing your search query or switching back to "All".
        </p>
      </div>
    );
  }

  return (
    <div
      ref={gridRef}
      className="icon-grid"
      style={{
        gridTemplateColumns:
          gridWidth > 0
            ? `repeat(${columns}, 1fr)`
            : `repeat(auto-fill, minmax(${MIN_TRACK_PX}px, 1fr))`,
        gap: `${GRID_GAP_PX}px`,
      }}
    >
      {icons.map(icon => (
        <IconCard
          key={icon.id}
          icon={icon}
          isSelected={selected.has(icon.id)}
          isSelectionMode={isSelectionMode}
          onToggleSelect={handleToggleSelect}
          options={options}
          stageWidth={stageWidth}
        />
      ))}
    </div>
  );
};
