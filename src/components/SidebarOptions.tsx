import React from 'react';
import { Wand2, ChevronDown } from 'lucide-react';
import { ExcalidrawOptions, ResolvedPreset } from '../types';
import { useStyleOptions, sameOptions } from './options/useStyleOptions';
import { PresetSection } from './options/PresetSection';
import { ArtworkSection } from './options/ArtworkSection';
import { FrameSection } from './options/FrameSection';
import { LabelSection } from './options/LabelSection';

/**
 * The styling panel: a collapsible shell around four independent sections.
 *
 * This file owns only what the sections cannot each decide for themselves -
 * whether the panel is open, and which preset the current options happen to
 * match. Everything that reads or writes an option goes through
 * `useStyleOptions`; everything that renders one lives in `options/`.
 */
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
