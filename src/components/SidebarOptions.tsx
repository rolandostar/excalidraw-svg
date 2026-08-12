import React from 'react';
import { ChevronDown, Sliders, Wand2 } from 'lucide-react';
import type { ResolvedPreset } from '../types/icons';
import { ICON_SCALES, type ExcalidrawOptions } from '../types/options';
import { sameOptions, useStyleOptions, type SectionProps } from './options/useStyleOptions';
import { ICON_BASE_SIZE } from '../utils/defaultOptions';
import { Segments, Slider } from './options/controls';
import { ROUGHNESS_LABELS, ROUGHNESS_VALUES } from './options/labels';
import { FrameSection } from './options/FrameSection';
import { LabelSection } from './options/LabelSection';

/**
 * The styling panel: a collapsible shell around four sections.
 *
 * Presets and Artwork are here because neither is more than a handful of
 * controls; Frame and Label are large enough to read on their own and live in
 * `options/`. Everything that reads or writes an option goes through
 * `useStyleOptions`, which is where the "the control does nothing" rules are.
 */
/**
 * The row of named looks a set declares in its `set.json`.
 *
 * Purely presentational: which preset is active is decided by comparing the
 * live options against each preset's, in `SidebarOptions`, because there is no
 * such thing as a stored "current preset" - see `sameOptions`.
 */
function PresetSection({
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

/**
 * Everything that applies to the icon itself, with or without a frame.
 *
 * Deliberately before Frame, and outside it. Icon roughness used to live
 * inside the frame section, gated on the frame being switched on - while the
 * value it set was applied to the artwork regardless. So sketchy icons were
 * unreachable without a card, and turning the card off left the icons sketchy
 * with no visible control explaining why.
 */
function ArtworkSection({ options, style }: SectionProps) {
  return (
    <section className="opt-section">
      <h3 className="opt-heading">
        <Sliders size={14} aria-hidden="true" />
        Artwork
      </h3>

      <Slider
        label="Icon scale"
        value={options.iconScale}
        display={`${Math.round(ICON_BASE_SIZE * options.iconScale)}px · ${options.iconScale}x`}
        min={ICON_SCALES[0]}
        max={ICON_SCALES[ICON_SCALES.length - 1]}
        step={ICON_SCALES[1] - ICON_SCALES[0]}
        ariaLabel="Icon scale"
        onChange={v => style.updateOption('iconScale', v)}
      />

      <Segments
        label="Roughness"
        values={ROUGHNESS_VALUES}
        current={options.iconRoughness}
        render={r => ROUGHNESS_LABELS[r]}
        onSelect={r => style.updateOption('iconRoughness', r)}
      />
    </section>
  );
}

interface SidebarOptionsProps {
  options: ExcalidrawOptions;
  setOptions: React.Dispatch<React.SetStateAction<ExcalidrawOptions>>;
  /** Declared by the open set's `set.json`; see `resolvePresets`. */
  presets: ResolvedPreset[];
}

export const SidebarOptions: React.FC<SidebarOptionsProps> = ({ options, setOptions, presets }) => {
  const style = useStyleOptions(setOptions);

  // Collapsed only on narrow viewports, where this panel otherwise fills the
  // entire first screen and pushes the grid below the fold. The CSS ignores
  // this class above the breakpoint, so desktop is never collapsed.
  const [isOpen, setIsOpen] = React.useState(false);

  const activePreset = presets.find(p => sameOptions(p.options, options)) ?? null;

  return (
    <aside className={`sidebar${isOpen ? ' is-open' : ''}`}>
      <button className="sidebar-summary" onClick={() => setIsOpen(o => !o)} aria-expanded={isOpen}>
        <Wand2 size={15} aria-hidden="true" />
        Styling
        {activePreset && <span className="sidebar-summary-tag">{activePreset.label}</span>}
        <ChevronDown size={15} className="sidebar-summary-chevron" aria-hidden="true" />
      </button>

      <div className="sidebar-body">
        <PresetSection
          presets={presets}
          activeId={activePreset?.id ?? null}
          onSelect={preset => setOptions(preset.options)}
        />
        <ArtworkSection options={options} style={style} />
        <FrameSection options={options} style={style} />
        <LabelSection options={options} style={style} />
      </div>
    </aside>
  );
};
