import React from 'react';
import { Search, Copy, Download, Layers, CheckSquare, Square, Sparkles } from 'lucide-react';
import { GCPIcon, ExcalidrawOptions } from '../types';
import { buildExcalidrawLibraryPackage, buildExcalidrawClipboardData } from '../utils/excalidrawGenerator';
import confetti from 'canvas-confetti';

interface HeaderProps {
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
}

export const Header: React.FC<HeaderProps> = ({
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
}) => {
  const isAllSelected = filteredIcons.length > 0 && selectedIds.length === filteredIcons.length;

  const handleToggleSelectionMode = () => {
    const next = !isSelectionMode;
    setIsSelectionMode(next);
    if (!next) {
      setSelectedIds([]);
    }
  };

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredIcons.map(i => i.id));
    }
  };

  const getTargetIcons = (): GCPIcon[] => {
    if (selectedIds.length > 0) {
      return allIcons.filter(i => selectedIds.includes(i.id));
    }
    return filteredIcons;
  };

  const handleCopyClipboard = async () => {
    const targetIcons = getTargetIcons();
    if (targetIcons.length === 0) return;

    const { jsonText } = buildExcalidrawClipboardData(targetIcons, options);

    try {
      await navigator.clipboard.writeText(jsonText);

      confetti({
        particleCount: 60,
        spread: 60,
        origin: { y: 0.1 },
        colors: ['#4285F4', '#34A853', '#FBBC05', '#EA4335'],
      });

      alert(`Copied ${targetIcons.length} item(s) to Clipboard!\n\nOpen Excalidraw (excalidraw.com) and press Ctrl+V to paste!`);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const handleDownloadLibrary = () => {
    const targetIcons = getTargetIcons();
    if (targetIcons.length === 0) return;

    const pkg = buildExcalidrawLibraryPackage(targetIcons, options);
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const filename = targetIcons.length === allIcons.length
      ? 'Google-Cloud-Platform-Excalidraw.excalidrawlib'
      : `GCP-Custom-Library-${targetIcons.length}-items.excalidrawlib`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.1 },
      colors: ['#4285F4', '#34A853', '#FBBC05', '#EA4335'],
    });
  };

  return (
    <header className="app-header">
      <div className="brand-section">
        <div className="brand-icon">
          <Layers className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="brand-title">
            GCP Excalidraw <span className="brand-subtitle">Studio</span>
          </h1>
        </div>
      </div>

      <div className="search-bar">
        <Search className="w-4 h-4 text-slate-400" />
        <input
          type="text"
          className="search-input"
          placeholder="Search 216 GCP icons (e.g. Cloud Run, BigQuery, Pub/Sub)..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="header-actions">
        {/* Multi-Select Mode Toggle */}
        <button
          className={`btn ${isSelectionMode ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={handleToggleSelectionMode}
          title={isSelectionMode ? 'Exit Batch Selection Mode' : 'Enable Batch Multi-Select Mode'}
        >
          <CheckSquare className="w-4 h-4" />
          {isSelectionMode ? 'Multi-Select: ON' : 'Select Multiple'}
        </button>

        {isSelectionMode && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleToggleSelectAll}
            title={isAllSelected ? 'Deselect All' : 'Select All Filtered'}
          >
            {isAllSelected ? <CheckSquare className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4" />}
            {selectedIds.length > 0 ? `${selectedIds.length} Selected` : 'Select All'}
          </button>
        )}

        <button
          className="btn btn-secondary btn-sm"
          onClick={onOpenPreview}
          title="Inspect Excalidraw JSON Schema"
        >
          <Sparkles className="w-4 h-4 text-yellow-400" />
          Preview
        </button>

        {isSelectionMode && (
          <button
            className="btn btn-primary"
            onClick={handleCopyClipboard}
            title="Copy Selected items to Excalidraw Clipboard"
          >
            <Copy className="w-4 h-4" />
            Copy Selected ({selectedIds.length})
          </button>
        )}

        <button
          className="btn btn-accent"
          onClick={handleDownloadLibrary}
          title="Download .excalidrawlib library package"
        >
          <Download className="w-4 h-4" />
          Export .excalidrawlib {selectedIds.length > 0 ? `(${selectedIds.length})` : '(All)'}
        </button>
      </div>
    </header>
  );
};
