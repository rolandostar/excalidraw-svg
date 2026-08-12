import { Wand2 } from 'lucide-react';
import type { ResolvedPreset } from '../../types/icons';

/**
 * The row of named looks a set declares in its `set.json`.
 *
 * Purely presentational: which preset is active is decided by comparing the
 * live options against each preset's, in `SidebarOptions`, because there is no
 * such thing as a stored "current preset" - see `sameOptions`.
 */
export function PresetSection({
  presets,
  activeId,
  onSelect,
}: {
  presets: ResolvedPreset[];
  activeId: string | null;
  onSelect: (preset: ResolvedPreset) => void;
}) {
  return (
    <section className="opt-section">
      <h3 className="opt-heading">
        <Wand2 size={14} aria-hidden="true" />
        Presets
      </h3>

      <div className="preset-grid">
        {presets.map(preset => (
          <button
            key={preset.id}
            type="button"
            className={`preset-btn${activeId === preset.id ? ' is-active' : ''}`}
            onClick={() => onSelect(preset)}
            aria-pressed={activeId === preset.id}
            title={preset.hint}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </section>
  );
}
