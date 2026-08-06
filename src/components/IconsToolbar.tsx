import React from 'react';
import { Search, Copy, Download, CheckSquare, Square, Sparkles, X } from 'lucide-react';
import { GCPIcon, ExcalidrawOptions } from '../types';
import { CATEGORIES } from '../utils/categorizer';
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
  filteredIcons: GCPIcon[];
  allIcons: GCPIcon[];
  options: ExcalidrawOptions;
  onOpenPreview: () => void;
  activeCategory: string;
  setActiveCategory: (id: string) => void;
  categoryCounts: Record<string, number>;
  onToast: (message: string) => void;
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
  onOpenPreview,
  activeCategory,
  setActiveCategory,
  categoryCounts,
  onToast,
}) => {
  const isAllSelected = filteredIcons.length > 0 && selectedIds.length === filteredIcons.length;

  const targetIcons = selectedIds.length > 0
    ? allIcons.filter(i => selectedIds.includes(i.id))
    : filteredIcons;

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
    a.download =
      targetIcons.length === allIcons.length
        ? 'Google-Cloud-Platform-Excalidraw.excalidrawlib'
        : `GCP-Custom-Library-${targetIcons.length}-items.excalidrawlib`;
    a.click();
    URL.revokeObjectURL(url);

    celebrate(80);
    onToast(`Downloaded a library of ${targetIcons.length} item${targetIcons.length === 1 ? '' : 's'}`);
  };

  const chips = [
    { id: 'all', name: 'All', count: allIcons.length },
    ...Object.values(CATEGORIES).map(c => ({
      id: c.id,
      name: c.name,
      count: categoryCounts[c.id] ?? 0,
    })),
  ];

  return (
    <div className="icons-toolbar">
      <div className="icons-toolbar-row">
        <div className="search-bar">
          <Search size={16} className="search-icon" aria-hidden="true" />
          <input
            type="search"
            className="search-input"
            placeholder={`Search ${allIcons.length} icons — Cloud Run, BigQuery, Pub/Sub…`}
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

          <button className="btn btn-secondary btn-sm" onClick={onOpenPreview}>
            <Sparkles size={15} />
            Inspect
          </button>

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
    </div>
  );
};
