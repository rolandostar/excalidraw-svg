import React from 'react';
import { CheckSquare, Copy, Download, Search, Square, X } from 'lucide-react';
import type { IconAsset, IconCategory } from '../types/icons';
import type { ExcalidrawOptions } from '../types/options';
import {
  buildExcalidrawClipboardData,
  buildExcalidrawLibraryPackage,
} from '../utils/layout/packGrid';
import { celebrate } from '../utils/celebrate';
import { downloadJson } from '../utils/download';
import { plural } from '../utils/plural';
import { useClipboardCopy } from '../hooks/useClipboardCopy';
import { useToast } from './Toast';

/**
 * What the user is narrowing the grid by. Produced whole by `useIconFilters`,
 * which owns the persistence, so the toolbar neither knows nor cares that any
 * of it survives a reload.
 */
export interface IconFilters {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activeCategory: string;
  setActiveCategory: React.Dispatch<React.SetStateAction<string>>;
  /** How many icons each category would show under the current search. */
  categoryCounts: Record<string, number>;
  /** Filter chips, declared by the set's own `set.json`. */
  categories: IconCategory[];
}

/** What the user has picked out, and whether picking is switched on at all. */
export interface IconSelection {
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  isSelectionMode: boolean;
  setIsSelectionMode: React.Dispatch<React.SetStateAction<boolean>>;
}

/** The set being browsed, and the look it would be exported with. */
export interface IconLibrary {
  all: IconAsset[];
  filtered: IconAsset[];
  options: ExcalidrawOptions;
  /** Used for the export filename, so a download says which set it came from. */
  setName: string;
}

interface IconsToolbarProps {
  filters: IconFilters;
  selection: IconSelection;
  library: IconLibrary;
}

/** Turns "Google Cloud (legacy)" into "Google-Cloud-legacy" for a filename. */
function toFileSlug(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'Icons';
}

/**
 * The single control bar for the icon library.
 *
 * Previously this was a full second header, complete with its own logo and
 * product name stacked directly beneath the site header - two brand lockups,
 * two blurred sticky bars, and roughly 130px of chrome before any content.
 * There is one header on this site; this is a toolbar.
 *
 * It used to take fifteen props, nine of them raw setters or derived values
 * read once. They are grouped now: what is being filtered, what is selected,
 * and what would be exported.
 */
export const IconsToolbar: React.FC<IconsToolbarProps> = ({ filters, selection, library }) => {
  const { searchQuery, setSearchQuery, activeCategory, setActiveCategory } = filters;
  const { selectedIds, setSelectedIds, isSelectionMode, setIsSelectionMode } = selection;
  const { all: allIcons, filtered: filteredIcons, options, setName } = library;

  const onToast = useToast();

  const isAllSelected = filteredIcons.length > 0 && selectedIds.length === filteredIcons.length;

  const targetIcons = React.useMemo(() => {
    if (selectedIds.length === 0) return filteredIcons;
    const selected = new Set(selectedIds);
    return allIcons.filter(i => selected.has(i.id));
  }, [allIcons, filteredIcons, selectedIds]);

  const { copy } = useClipboardCopy({
    onSuccess: () => {
      celebrate(60);
      onToast(`${plural(targetIcons.length, 'item')} copied — paste into Excalidraw with Ctrl+V`);
    },
    onError: onToast,
  });

  const handleCopy = () => {
    if (targetIcons.length === 0) return;
    void copy(() => buildExcalidrawClipboardData(targetIcons, options).jsonText);
  };

  const handleDownload = () => {
    if (targetIcons.length === 0) return;

    const pkg = buildExcalidrawLibraryPackage(targetIcons, options);
    const slug = toFileSlug(setName);
    const filename =
      targetIcons.length === allIcons.length
        ? `${slug}-Excalidraw.excalidrawlib`
        : `${slug}-${targetIcons.length}-items.excalidrawlib`;

    downloadJson(filename, JSON.stringify(pkg, null, 2));

    celebrate(80);
    onToast(`Downloaded a library of ${plural(targetIcons.length, 'item')}`);
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
    const { categories, categoryCounts } = filters;
    const populated = categories.filter(
      c => (categoryCounts[c.id] ?? 0) > 0 || c.id === activeCategory
    );
    if (populated.length < 2) return [];

    return [
      { id: 'all', name: 'All', count: allIcons.length },
      ...populated.map(c => ({ id: c.id, name: c.name, count: categoryCounts[c.id] ?? 0 })),
    ];
  }, [filters, activeCategory, allIcons.length]);

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
