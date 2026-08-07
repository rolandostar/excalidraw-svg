import React from 'react';
import { Frame, Type, Sliders, Wand2, ChevronDown, Check } from 'lucide-react';
import {
  ExcalidrawOptions,
  CardStyle,
  LabelPosition,
  LabelFontFamily,
  ResolvedPreset,
} from '../types';
import { ICON_BASE_SIZE } from '../utils/defaultOptions';

interface SidebarOptionsProps {
  options: ExcalidrawOptions;
  setOptions: React.Dispatch<React.SetStateAction<ExcalidrawOptions>>;
  /** Declared by the open set's `set.json`; see `resolvePresets`. */
  presets: ResolvedPreset[];
}

const BG_COLORS = [
  'rgba(30, 41, 59, 0.8)',
  '#0f172a',
  '#ffffff',
  '#e8f0fe',
  '#e6f4ea',
  '#fef7e0',
  '#fce8e6',
  'transparent',
];

const STROKE_COLORS = [
  '#4285f4',
  '#34a853',
  '#fbbc05',
  '#ea4335',
  '#64748b',
  '#cbd5e1',
  '#1e293b',
  'transparent',
];

const TEXT_COLORS = ['#ffffff', '#f8fafc', '#94a3b8', '#4285f4', '#34a853', '#1e293b', '#0f172a'];

/**
 * Ensures the picker always contains the value it is meant to be showing.
 *
 * Sets choose their own label and frame colours, and nothing constrains those
 * to this palette - `unique-icons` labels in its own accent. Without this the
 * active swatch simply would not be in the row, so the control would look
 * unset and there would be no way back to it after trying another colour.
 */
function withCurrent(palette: string[], current: string): string[] {
  return palette.includes(current) ? palette : [...palette, current];
}

const COLOR_NAMES: Record<string, string> = {
  'rgba(30, 41, 59, 0.8)': 'Slate, translucent',
  'rgba(30, 41, 59, 0.6)': 'Slate, translucent',
  '#0f172a': 'Near black',
  '#ffffff': 'White',
  '#f8fafc': 'Off white',
  '#e8f0fe': 'Blue tint',
  '#e6f4ea': 'Green tint',
  '#fef7e0': 'Yellow tint',
  '#fce8e6': 'Red tint',
  '#4285f4': 'Blue',
  '#34a853': 'Green',
  '#fbbc05': 'Yellow',
  '#ea4335': 'Red',
  '#64748b': 'Grey',
  '#94a3b8': 'Light grey',
  '#cbd5e1': 'Pale grey',
  '#1e293b': 'Dark slate',
  transparent: 'None',
};

const FONT_NAMES: Record<LabelFontFamily, string> = {
  1: 'Excalifont',
  2: 'Helvetica',
  3: 'Comic Shanns',
  4: 'Lilita One',
  5: 'Nunito',
};

/**
 * Presets are compared by value, not tracked by id.
 *
 * Storing "which preset is active" would go stale the moment any individual
 * control was touched, and would then claim a look the grid is not showing.
 */
function sameOptions(a: ExcalidrawOptions, b: ExcalidrawOptions): boolean {
  return (Object.keys(a) as (keyof ExcalidrawOptions)[]).every(k => a[k] === b[k]);
}

/** A labelled swatch. A `div` with an `onClick` could not be reached by keyboard. */
function Swatch({
  color,
  active,
  onSelect,
}: {
  color: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`color-swatch${active ? ' active' : ''}`}
      style={{ backgroundColor: color }}
      data-transparent={color === 'transparent' || undefined}
      aria-label={COLOR_NAMES[color] ?? color}
      aria-pressed={active}
      onClick={onSelect}
    >
      {active && <Check size={12} strokeWidth={3} aria-hidden="true" />}
    </button>
  );
}

function Field({ label, value, children }: { label: string; value?: string; children: React.ReactNode }) {
  return (
    <div className="opt-field">
      <div className="opt-field-head">
        <span className="opt-field-label">{label}</span>
        {value !== undefined && <span className="opt-field-value">{value}</span>}
      </div>
      {children}
    </div>
  );
}

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="opt-switch">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="opt-switch-track" aria-hidden="true">
        <span className="opt-switch-thumb" />
      </span>
    </label>
  );
}

export const SidebarOptions: React.FC<SidebarOptionsProps> = ({ options, setOptions, presets }) => {
  const updateOption = <K extends keyof ExcalidrawOptions>(key: K, value: ExcalidrawOptions[K]) => {
    setOptions(prev => (prev[key] === value ? prev : { ...prev, [key]: value }));
  };

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
                className={`preset-btn${activePreset?.id === preset.id ? ' is-active' : ''}`}
                onClick={() => setOptions(preset.options)}
                aria-pressed={activePreset?.id === preset.id}
                title={preset.hint}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </section>

        <section className="opt-section">
          <h3 className="opt-heading">
            <Frame size={14} aria-hidden="true" />
            Frame
          </h3>

          <Switch
            label="Show card frame"
            checked={options.showCard}
            onChange={v =>
              setOptions(prev => ({
                ...prev,
                showCard: v,
                // A stored `'none'` predates this control and would switch the
                // frame on while suppressing the rectangle, so the toggle
                // would look broken. Anyone who wants no frame uses the
                // toggle itself.
                cardStyle: v && prev.cardStyle === 'none' ? 'soft-card' : prev.cardStyle,
                // Same for a fully transparent frame: stroke and fill both
                // invisible is indistinguishable from the option not working.
                cardStrokeColor:
                  v && prev.cardStrokeColor === 'transparent' && prev.cardBgColor === 'transparent'
                    ? '#4285f4'
                    : prev.cardStrokeColor,
              }))
            }
          />

          {options.showCard && (
            <>
              <Field label="Style">
                <div className="segmented-control">
                  {(['soft-card', 'sketch-box', 'outline'] as CardStyle[]).map(style => (
                    <button
                      key={style}
                      type="button"
                      className={`segment-btn${options.cardStyle === style ? ' active' : ''}`}
                      onClick={() => updateOption('cardStyle', style)}
                      aria-pressed={options.cardStyle === style}
                    >
                      {style === 'soft-card' ? 'Soft' : style === 'sketch-box' ? 'Sketch' : 'Outline'}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Background">
                <div className="color-picker-grid">
                  {withCurrent(BG_COLORS, options.cardBgColor).map(c => (
                    <Swatch
                      key={c}
                      color={c}
                      active={options.cardBgColor === c}
                      onSelect={() => updateOption('cardBgColor', c)}
                    />
                  ))}
                </div>
              </Field>

              <Field label="Stroke">
                <div className="color-picker-grid">
                  {withCurrent(STROKE_COLORS, options.cardStrokeColor).map(c => (
                    <Swatch
                      key={c}
                      color={c}
                      active={options.cardStrokeColor === c}
                      onSelect={() => updateOption('cardStrokeColor', c)}
                    />
                  ))}
                </div>
              </Field>

              <Field label="Roughness">
                <div className="segmented-control">
                  {[0, 1, 2].map(r => (
                    <button
                      key={r}
                      type="button"
                      className={`segment-btn${options.roughness === r ? ' active' : ''}`}
                      onClick={() => updateOption('roughness', r)}
                      aria-pressed={options.roughness === r}
                    >
                      {r === 0 ? 'Clean' : r === 1 ? 'Subtle' : 'Sketch'}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Padding" value={`${options.padding}px`}>
                <input
                  type="range"
                  min="4"
                  max="24"
                  step="2"
                  value={options.padding}
                  aria-label="Inner padding"
                  onChange={e => updateOption('padding', Number(e.target.value))}
                />
              </Field>
            </>
          )}
        </section>

        <section className="opt-section">
          <h3 className="opt-heading">
            <Type size={14} aria-hidden="true" />
            Label
          </h3>

          <Switch
            label="Show label"
            checked={options.showLabel}
            onChange={v => updateOption('showLabel', v)}
          />

          {options.showLabel && (
            <>
              <Field label="Position">
                <div className="segmented-control">
                  {(['bottom', 'right', 'top', 'inside'] as LabelPosition[]).map(pos => (
                    <button
                      key={pos}
                      type="button"
                      className={`segment-btn${options.labelPosition === pos ? ' active' : ''}`}
                      onClick={() => updateOption('labelPosition', pos)}
                      aria-pressed={options.labelPosition === pos}
                    >
                      {pos.charAt(0).toUpperCase() + pos.slice(1)}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Font">
                <div className="font-grid">
                  {([1, 2, 3, 4, 5] as LabelFontFamily[]).map(font => (
                    <button
                      key={font}
                      type="button"
                      className={`font-btn${options.labelFontFamily === font ? ' is-active' : ''}`}
                      data-font={font}
                      onClick={() => updateOption('labelFontFamily', font)}
                      aria-pressed={options.labelFontFamily === font}
                    >
                      {FONT_NAMES[font]}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Size" value={`${options.labelFontSize}px`}>
                <input
                  type="range"
                  min="10"
                  max="28"
                  step="1"
                  value={options.labelFontSize}
                  aria-label="Label font size"
                  onChange={e => updateOption('labelFontSize', Number(e.target.value))}
                />
              </Field>

              <Field label="Colour">
                <div className="color-picker-grid">
                  {withCurrent(TEXT_COLORS, options.labelColor).map(c => (
                    <Swatch
                      key={c}
                      color={c}
                      active={options.labelColor === c}
                      onSelect={() => updateOption('labelColor', c)}
                    />
                  ))}
                </div>
              </Field>
            </>
          )}
        </section>

        <section className="opt-section">
          <h3 className="opt-heading">
            <Sliders size={14} aria-hidden="true" />
            Size
          </h3>

          <Field
            label="Icon scale"
            value={`${Math.round(ICON_BASE_SIZE * options.iconScale)}px · ${options.iconScale}x`}
          >
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.25"
              value={options.iconScale}
              aria-label="Icon scale"
              onChange={e => updateOption('iconScale', Number(e.target.value))}
            />
          </Field>
        </section>
      </div>
    </aside>
  );
};
