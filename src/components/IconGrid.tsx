import React from 'react';
import { IconAsset, ExcalidrawOptions } from '../types';
import { IconCard } from './IconCard';
import { SearchX } from 'lucide-react';

interface IconGridProps {
  icons: IconAsset[];
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  isSelectionMode: boolean;
  options: ExcalidrawOptions;
  onToast: (message: string) => void;
}

export const IconGrid: React.FC<IconGridProps> = ({
  icons,
  selectedIds,
  setSelectedIds,
  isSelectionMode,
  options,
  onToast,
}) => {
  // Identity-stable, or `React.memo` on IconCard would never hold.
  const handleToggleSelect = React.useCallback(
    (id: string) => {
      setSelectedIds(prev => (prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]));
    },
    [setSelectedIds]
  );

  // `selectedIds.includes` inside the map was O(n^2) over 216 cards.
  const selected = React.useMemo(() => new Set(selectedIds), [selectedIds]);

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
        <SearchX className="w-12 h-12 text-slate-500" />
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
    <div className="icon-grid">
      {icons.map(icon => (
        <IconCard
          key={icon.id}
          icon={icon}
          isSelected={selected.has(icon.id)}
          isSelectionMode={isSelectionMode}
          onToggleSelect={handleToggleSelect}
          options={options}
          onToast={onToast}
        />
      ))}
    </div>
  );
};
