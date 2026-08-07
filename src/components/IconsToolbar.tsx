import React from 'react';
import { Search, Copy, Download, CheckSquare, Square, X } from 'lucide-react';
import { IconAsset, IconCategory, ExcalidrawOptions } from '../types';
import {
  buildExcalidrawLibraryPackage,
  buildExcalidrawClipboardData,
} from '../utils/excalidrawGenerator';
import confetti from 'canvas-confetti';

interface IconsToolbarProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  isSelectionMode: boolean;
  setIsSelectionMode: React.Dispatch<React.SetStateAction<boolean>>;
  filteredIcons: IconAsset[];
  allIcons: IconAsset[];
  options: ExcalidrawOptions;
  activeCategory: string;
  setActiveCategory: (id: string) => void;
  categoryCounts: Record<string, number>;
  /** Filter chips, declared by the set's own `set.json`. */
  categories: IconCategory[];
  /** Used for the export filename, so a download says which set it came from. */
  setName: string;
  onToast: (message: string) => void;
}

/** Turns "Google Cloud (legacy)" into "Google-Cloud-legacy" for a filename. */
function toFileSlug(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'Icons';
}

const GCP_COLORS = ['#4285F4', '#34A853', '#FBBC05', '#EA4335'];

/**
 * The single control bar for the icon library.
 *
 * Previously this was a full second header, complete with its own logo and
 * product name stacked directly beneath the site header - two brand lockups,
 * two blurred sticky bars, and roughly 130px of chrome before any content.
 * There is one header on this site; this is a toolbar.
 */
export const IconsToolbar: React.FC<IconsToolbarProps> = ({
  searchQuery,
  setSearchQuery,
  selectedIds,
  setSelectedIds,
  isSelectionMode,
  setIsSelectionMode,
  filteredIcons,
  allIcons,
  options,
  activeCategory,
  setActiveCategory,
  categoryCounts,
  categories,
  setName,
  onToast,
}) => {
  const isAllSelected = filteredIcons.length > 0 && selectedIds.length === filteredIcons.length;

  const targetIcons = React.useMemo(() => {
    if (selectedIds.length === 0) return filteredIcons;
    const selected = new Set(selectedIds);
    return allIcons.filter(i => selected.has(i.id));
  }, [allIcons, filteredIcons, selectedIds]);

  const celebrate = (particleCount: number) =>
    confetti({ particleCount, spread: 65, origin: { y: 0.15 }, colors: GCP_COLORS });

  const handleCopy = async () => {
    if (targetIcons.length === 0) return;
    const { jsonText } = buildExcalidrawClipboardData(targetIcons, options);
    try {
      await navigator.clipboard.writeText(jsonText);
      celebrate(60);
      onToast(
        `${targetIcons.length} item${targetIcons.length === 1 ? '' : 's'} copied — paste into Excalidraw with Ctrl+V`
      );
    } catch {
      onToast('Could not access the clipboard.');
    }
  };

  const handleDownload = () => {
    if (targetIcons.length === 0) return;
    const pkg = buildExcalidrawLibraryPackage(targetIcons, options);
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    const slug = toFileSlug(setName);
    a.download =
      targetIcons.length === allIcons.length
        ? `${slug}-Excalidraw.excalidrawlib`
        : `${slug}-${targetIcons.length}-items.excalidrawlib`;
    a.click();
    URL.revokeObjectURL(url);

    celebrate(80);
    onToast(`Downloaded a library of ${targetIcons.length} item${targetIcons.length === 1 ? '' : 's'}`);
  };

  /**
   * Empty buckets are dropped, and a set left with one bucket shows no bar.
   *
   * A category is allowed to be a declared-but-unused fallback - `rules` is
   * first-wins and needs somewhere for an unmatched file to land - so offering
   * a filter that is guaranteed to empty the grid would be a control that only
   * ever does damage. The currently selected chip survives regardless, or
   * clearing a search would yank the bar out from under the user.
   */
  const chips = React.useMemo(() => {
    const populated = categories.filter(
      c => (categoryCounts[c.id] ?? 0) > 0 || c.id === activeCategory
    );
    if (populated.length < 2) return [];

    return [
      { id: 'all', name: 'All', count: allIcons.length },
      ...populated.map(c => ({ id: c.id, name: c.name, count: categoryCounts[c.id] ?? 0 })),
    ];
  }, [categories, categoryCounts, activeCategory, allIcons.length]);

  return (
    <div className="icons-toolbar">
      <div className="icons-toolbar-row">
        <div className="search-bar">
          <Search size={16} className="search-icon" aria-hidden="true" />
          <input
            type="search"
            className="search-input"
            placeholder={`Search ${allIcons.length} icons in ${setName || 'this set'}…`}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label="Search icons"
          />
          {searchQuery && (
            <button
              className="search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="icons-toolbar-actions">
          <button
            className={`btn btn-sm ${isSelectionMode ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => {
              const next = !isSelectionMode;
              setIsSelectionMode(next);
              if (!next) setSelectedIds([]);
            }}
            aria-pressed={isSelectionMode}
          >
            <CheckSquare size={15} />
            Select
          </button>

          {isSelectionMode && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setSelectedIds(isAllSelected ? [] : filteredIcons.map(i => i.id))}
            >
              {isAllSelected ? <CheckSquare size={15} /> : <Square size={15} />}
              {selectedIds.length > 0 ? `${selectedIds.length} selected` : 'Select all'}
            </button>
          )}

          <button className="btn btn-secondary btn-sm" onClick={handleCopy}>
            <Copy size={15} />
            Copy{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
          </button>

          <button className="btn btn-primary btn-sm" onClick={handleDownload}>
            <Download size={15} />
            Export library{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
          </button>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="category-bar" role="tablist" aria-label="Icon categories">
          {chips.map(chip => (
            <button
              key={chip.id}
              role="tab"
              aria-selected={activeCategory === chip.id}
              className={`category-chip ${activeCategory === chip.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(chip.id)}
            >
              {chip.name}
              <span className="count-badge">{chip.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
