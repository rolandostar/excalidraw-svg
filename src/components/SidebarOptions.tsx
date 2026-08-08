import React from 'react';
import { Frame, Type, Sliders, Wand2, ChevronDown, Check, Plus } from 'lucide-react';
import {
  ExcalidrawOptions,
  CardCorners,
  CardFillStyle,
  CardStrokeWidth,
  LabelPosition,
  LabelFontFamily,
  ResolvedPreset,
  Roughness,
} from '../types';
import { ICON_BASE_SIZE } from '../utils/defaultOptions';
import { isColor } from '../utils/optionsSchema';

interface SidebarOptionsProps {
  options: ExcalidrawOptions;
  setOptions: React.Dispatch<React.SetStateAction<ExcalidrawOptions>>;
  /** Declared by the open set's `set.json`; see `resolvePresets`. */
  presets: ResolvedPreset[];
}

const BG_COLORS = [
  'rgba(30, 41, 59, 0.8)',
  '#0f172a',
  '#1e293b',
  '#ffffff',
  '#e8f0fe',
  '#e6f4ea',
  '#fef7e0',
  '#fce8e6',
  '#f3e8fd',
  'transparent',
];

const STROKE_COLORS = [
  '#4285f4',
  '#34a853',
  '#fbbc05',
  '#ea4335',
  '#a142f4',
  '#64748b',
  '#cbd5e1',
  '#1e293b',
  'transparent',
];

const TEXT_COLORS = [
  '#ffffff',
  '#f8fafc',
  '#cbd5e1',
  '#94a3b8',
  '#64748b',
  '#4285f4',
  '#34a853',
  '#fbbc05',
  '#ea4335',
  '#a142f4',
  '#1e293b',
  '#0f172a',
];

/**
 * Ensures the picker always contains the value it is meant to be showing.
 *
 * Sets choose their own label and frame colours, and nothing constrains those
 * to this palette - `unique-icons` labels in its own accent. The custom-colour
 * field can produce anything at all. Without this the active swatch simply
 * would not be in the row, so the control would look unset and there would be
 * no way back to it after trying another colour.
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
  '#f3e8fd': 'Purple tint',
  '#4285f4': 'Blue',
  '#34a853': 'Green',
  '#fbbc05': 'Yellow',
  '#ea4335': 'Red',
  '#a142f4': 'Purple',
  '#64748b': 'Grey',
  '#94a3b8': 'Light grey',
  '#cbd5e1': 'Pale grey',
  '#1e293b': 'Dark slate',
  transparent: 'None',
};

/**
 * Excalidraw's real font ids. See the note on `LabelFontFamily` for why these
 * are not 1-5, and why "Lilita One" never used to render.
 */
const FONT_NAMES: Record<LabelFontFamily, string> = {
  5: 'Excalifont',
  6: 'Nunito',
  7: 'Lilita One',
  8: 'Comic Shanns',
  9: 'Liberation',
};

const ROUGHNESS_LABELS: Record<Roughness, string> = {
  0: 'Clean',
  1: 'Subtle',
  2: 'Sketch',
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

/**
 * Whether a swatch fill is light enough to need a dark tick drawn on it.
 *
 * The stylesheet cannot work this out for itself: it used to try, with
 * `.color-swatch[style*="#ffffff"]`, but React serialises the inline
 * background as `rgb(255, 255, 255)` so those selectors never matched and
 * every pale swatch drew a white check on a white fill. Anything that is not
 * a plain hex - `transparent`, an `rgba()` - is not light; `transparent` has
 * its own attribute.
 */
function isLightColor(color: string): boolean {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return false;

  const full = hex.length === 3 ? hex.replace(/./g, c => c + c) : hex;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;

  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.7;
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
      data-tone={isLightColor(color) ? 'light' : undefined}
      aria-label={COLOR_NAMES[color] ?? color}
      aria-pressed={active}
      onClick={onSelect}
    >
      {active && <Check size={12} strokeWidth={3} aria-hidden="true" />}
    </button>
  );
}

/** `#rrggbb` for the native picker, which cannot represent anything else. */
function toPickerValue(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#4285f4';
}

/**
 * A palette row plus a custom colour.
 *
 * The palettes are a starting point, not the range of the control, so there
 * has to be a way out of them. Two inputs rather than one because neither
 * covers the field on its own: `<input type="color">` cannot express alpha or
 * `transparent`, both of which the shipped palettes use and the card genuinely
 * needs, while a bare text field makes picking a shade by eye impossible.
 *
 * The text field commits on blur or Enter and reverts on anything
 * unparseable. Committing per keystroke would repaint the whole grid for every
 * character of a six-digit hex, and would drive the value through states like
 * `#4` that render as black - which reads as the picker being broken rather
 * than as a half-typed colour.
 */
function ColorField({
  label,
  palette,
  value,
  onChange,
}: {
  label: string;
  palette: string[];
  value: string;
  onChange: (color: string) => void;
}) {
  const [draft, setDraft] = React.useState(value);
  const inputId = React.useId();

  // Presets and set switches change the colour from outside this component;
  // without this the text field would keep showing the previous value.
  React.useEffect(() => setDraft(value), [value]);

  const commit = () => {
    const next = draft.trim();
    if (next === value) return;
    if (isColor(next)) onChange(next);
    else setDraft(value);
  };

  const isCustom = !palette.includes(value);

  return (
    <div className="opt-field">
      <div className="opt-field-head">
        <span className="opt-field-label">{label}</span>
      </div>

      <div className="color-picker-grid">
        {withCurrent(palette, value).map(c => (
          <Swatch key={c} color={c} active={value === c} onSelect={() => onChange(c)} />
        ))}

        {/*
          A real `<input type="color">`, visually replaced by the swatch. A
          button that programmatically clicks a hidden input is not reachable
          by keyboard in the same way and loses the native picker's own
          keyboard handling.
        */}
        <label
          className={`color-swatch color-swatch-custom${isCustom ? ' active' : ''}`}
          title="Custom colour"
        >
          <Plus size={12} strokeWidth={3} aria-hidden="true" />
          <input
            type="color"
            value={toPickerValue(value)}
            aria-label={`${label}: pick a custom colour`}
            onChange={e => onChange(e.target.value)}
          />
        </label>
      </div>

      <input
        id={inputId}
        type="text"
        className="color-hex-input"
        value={draft}
        spellCheck={false}
        autoComplete="off"
        placeholder="#4285f4"
        aria-label={`${label}: hex or CSS colour`}
        aria-invalid={draft.trim() !== value && !isColor(draft.trim())}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') setDraft(value);
        }}
      />
    </div>
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

/** A segmented control over a fixed set of values. */
function Segments<T extends string | number>({
  label,
  values,
  current,
  render,
  onSelect,
  hint,
}: {
  label: string;
  values: readonly T[];
  current: T;
  render: (value: T) => React.ReactNode;
  onSelect: (value: T) => void;
  hint?: string;
}) {
  return (
    <Field label={label}>
      <div className="segmented-control">
        {values.map(value => (
          <button
            key={String(value)}
            type="button"
            className={`segment-btn${current === value ? ' active' : ''}`}
            onClick={() => onSelect(value)}
            aria-pressed={current === value}
          >
            {render(value)}
          </button>
        ))}
      </div>
      {hint && <p className="opt-hint">{hint}</p>}
    </Field>
  );
}

function Switch({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <>
      <label className="opt-switch">
        <span>{label}</span>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
        <span className="opt-switch-track" aria-hidden="true">
          <span className="opt-switch-thumb" />
        </span>
      </label>
      {hint && <p className="opt-hint">{hint}</p>}
    </>
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

  /*
   * A hatched fill paints in the background colour, so it draws nothing over a
   * transparent background. Rather than let the control silently do nothing,
   * choosing a hatch gives the card a background if it has none - and the
   * background swatches stay free to take it back to transparent, which snaps
   * the fill back to solid. `normaliseOptions` enforces the same pairing for
   * values arriving from `set.json` and localStorage.
   */
  const setFillStyle = (fillStyle: CardFillStyle) => {
    setOptions(prev => ({
      ...prev,
      cardFillStyle: fillStyle,
      cardBgColor:
        fillStyle !== 'solid' && prev.cardBgColor === 'transparent'
          ? prev.cardStrokeColor !== 'transparent'
            ? prev.cardStrokeColor
            : '#4285f4'
          : prev.cardBgColor,
    }));
  };

  const setBgColor = (cardBgColor: string) => {
    setOptions(prev => ({
      ...prev,
      cardBgColor,
      cardFillStyle:
        cardBgColor === 'transparent' && prev.cardFillStyle !== 'solid'
          ? 'solid'
          : prev.cardFillStyle,
    }));
  };

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

        {/*
          Artwork before Frame, and outside it.

          Icon roughness used to live inside the frame section, gated on the
          frame being switched on - while the value it set was applied to the
          artwork regardless. So sketchy icons were unreachable without a card,
          and turning the card off left the icons sketchy with no visible
          control explaining why.
        */}
        <section className="opt-section">
          <h3 className="opt-heading">
            <Sliders size={14} aria-hidden="true" />
            Artwork
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

          <Segments
            label="Roughness"
            values={[0, 1, 2] as const}
            current={options.iconRoughness}
            render={r => ROUGHNESS_LABELS[r]}
            onSelect={r => updateOption('iconRoughness', r)}
          />
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
                // Stroke and fill both invisible is indistinguishable from the
                // option not working.
                cardStrokeColor:
                  v && prev.cardStrokeColor === 'transparent' && prev.cardBgColor === 'transparent'
                    ? '#4285f4'
                    : prev.cardStrokeColor,
              }))
            }
          />

          {options.showCard && (
            <>
              <Segments
                label="Corners"
                values={['rounded', 'square'] as const satisfies readonly CardCorners[]}
                current={options.cardCorners}
                render={c => (c === 'rounded' ? 'Rounded' : 'Square')}
                onSelect={c => updateOption('cardCorners', c)}
              />

              <Segments
                label="Stroke width"
                values={[1, 2, 4] as const satisfies readonly CardStrokeWidth[]}
                current={options.cardStrokeWidth}
                render={w => (w === 1 ? 'Thin' : w === 2 ? 'Bold' : 'Extra')}
                onSelect={w => updateOption('cardStrokeWidth', w)}
              />

              <Segments
                label="Fill"
                values={['solid', 'hachure', 'cross-hatch'] as const satisfies readonly CardFillStyle[]}
                current={options.cardFillStyle}
                render={f => (f === 'solid' ? 'Solid' : f === 'hachure' ? 'Hachure' : 'Cross')}
                onSelect={setFillStyle}
                hint={
                  options.cardFillStyle !== 'solid'
                    ? 'Hatching is drawn in the background colour, so it needs one.'
                    : undefined
                }
              />

              <ColorField
                label="Background"
                palette={BG_COLORS}
                value={options.cardBgColor}
                onChange={setBgColor}
              />

              <ColorField
                label="Stroke"
                palette={STROKE_COLORS}
                value={options.cardStrokeColor}
                onChange={c => updateOption('cardStrokeColor', c)}
              />

              <Segments
                label="Roughness"
                values={[0, 1, 2] as const}
                current={options.cardRoughness}
                render={r => ROUGHNESS_LABELS[r]}
                onSelect={r => updateOption('cardRoughness', r)}
              />

              <Field label="Padding" value={`${options.padding}px`}>
                <input
                  type="range"
                  min="0"
                  max="32"
                  step="2"
                  value={options.padding}
                  aria-label="Inner padding"
                  onChange={e => updateOption('padding', Number(e.target.value))}
                />
              </Field>

              <Switch
                label="Fit to artwork"
                checked={options.fitFrame}
                onChange={v => updateOption('fitFrame', v)}
                hint="Sizes the frame to the icon's real ink instead of its viewBox, removing the dead space around artwork that does not fill the square. Cards end up different sizes."
              />
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
              <Segments
                label="Position"
                values={['bottom', 'right', 'top'] as const satisfies readonly LabelPosition[]}
                current={options.labelPosition}
                render={p => p.charAt(0).toUpperCase() + p.slice(1)}
                onSelect={p => updateOption('labelPosition', p)}
              />

              <Field label="Font">
                <div className="font-grid">
                  {([5, 6, 7, 8, 9] as LabelFontFamily[]).map(font => (
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

              <ColorField
                label="Colour"
                palette={TEXT_COLORS}
                value={options.labelColor}
                onChange={c => updateOption('labelColor', c)}
              />
            </>
          )}
        </section>
      </div>
    </aside>
  );
};
