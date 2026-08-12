import React from 'react';
import { Check, Plus } from 'lucide-react';
import { FONT_FAMILIES, GCP_BLUE, ROUGHNESS } from '../types/options';
import type {
  CardCorners,
  CardFillStyle,
  CardStrokeWidth,
  LabelFontFamily,
  LabelPosition,
  Roughness,
} from '../types/options';
import { hexChannels, relativeLuminance } from '../convert/color';
import { isColor, normaliseColor } from '../scene/options';

/**
 * The primitives the styling sidebar is built from.
 *
 *   controls   field, switch, slider, segmented button row
 *   palettes   the swatch lists, and how a swatch presents itself
 *   labels     display name for every enumerated option value
 *   colour     the swatch row plus a native picker plus a hex field
 */

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

/**
 * The three generic input wrappers the styling sections are built from: a
 * labelled field, a segmented control over a fixed set of values, and a
 * switch.
 *
 * None of them know anything about `ExcalidrawOptions`. Keeping them
 * option-agnostic is what lets the four sections be short enough to read as
 * a description of the panel rather than as markup.
 */

export function Field({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children: React.ReactNode;
}) {
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
export function Segments<T extends string | number>({
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

export function Switch({
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

/**
 * A range input with its current value shown in the field head.
 *
 * Extracted because the panel has three of these and each one was six lines
 * of `<input type="range">` attributes wrapped in a `<Field>`.
 */
export function Slider({
  label,
  value,
  display,
  min,
  max,
  step,
  ariaLabel,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  ariaLabel: string;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label} value={display}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={ariaLabel}
        onChange={e => onChange(Number(e.target.value))}
      />
    </Field>
  );
}

/**
 * The colour palettes the styling sidebar offers, their accessible names, and
 * the two pure functions that decide how a swatch is presented.
 *
 * Data only, so the swatch row and the sections that use it can be read
 * without scrolling past ninety lines of hex.
 */


// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

export const BG_COLORS = [
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

export const STROKE_COLORS = [
  GCP_BLUE,
  '#34a853',
  '#fbbc05',
  '#ea4335',
  '#a142f4',
  '#64748b',
  '#cbd5e1',
  '#1e293b',
  'transparent',
];

export const TEXT_COLORS = [
  '#ffffff',
  '#f8fafc',
  '#cbd5e1',
  '#94a3b8',
  '#64748b',
  GCP_BLUE,
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
  [GCP_BLUE]: 'Blue',
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
 * Whether a swatch fill is light enough to need a dark tick drawn on it.
 *
 * The stylesheet cannot work this out for itself: React serialises the
 * inline background as `rgb(255, 255, 255)`, so an attribute selector on the
 * hex never matches and every pale swatch draws a white check on a white
 * fill. Anything that is not
 * a plain hex - `transparent`, an `rgba()` - is not light; `transparent` has
 * its own attribute.
 */
function isLightColor(color: string): boolean {
  const channels = hexChannels(color);
  return channels !== null && relativeLuminance(...channels) > 0.7;
}

/**
 * Display name for every enumerated option value.
 *
 * A `Record` keyed by the union rather than a ternary in the control, so
 * widening the union is a type error here instead of a segmented control that
 * silently labels the new value as one of the old ones.
 */
// ---------------------------------------------------------------------------
// Display names
// ---------------------------------------------------------------------------

export const CORNER_LABELS: Record<CardCorners, string> = {
  rounded: 'Rounded',
  square: 'Square',
};

export const STROKE_WIDTH_LABELS: Record<CardStrokeWidth, string> = {
  1: 'Thin',
  2: 'Bold',
  4: 'Extra',
};

export const FILL_LABELS: Record<CardFillStyle, string> = {
  solid: 'Solid',
  hachure: 'Hachure',
  'cross-hatch': 'Cross',
};

export const POSITION_LABELS: Record<LabelPosition, string> = {
  bottom: 'Bottom',
  right: 'Right',
  top: 'Top',
};

/**
 * Excalidraw's real font ids. See the note on `LabelFontFamily` for why these
 * are not 1-5, and why "Lilita One" never used to render.
 */
export const FONT_NAMES: Record<LabelFontFamily, string> = {
  5: 'Excalifont',
  6: 'Nunito',
  7: 'Lilita One',
  8: 'Comic Shanns',
  9: 'Liberation',
};

export const ROUGHNESS_LABELS: Record<Roughness, string> = {
  0: 'Clean',
  1: 'Subtle',
  2: 'Sketch',
};

/*
 * The controls iterate the allow-lists themselves rather than a local copy.
 * `satisfies` catches a value the union does not have; it cannot catch one
 * the union has and the copy is missing, which is the direction that leaves a
 * shipped option with no control.
 */
export const ROUGHNESS_VALUES = ROUGHNESS;
export const FONT_VALUES = FONT_FAMILIES;

/**
 * The colour control: a row of palette swatches, a native picker and a hex
 * field, all editing one colour.
 *
 * Owns the draft state for the text input and the rules about when a typed
 * value is committed. The palettes themselves live in `palette.ts`; this file
 * is only about the interaction.
 */

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

// ---------------------------------------------------------------------------
// Colour field
// ---------------------------------------------------------------------------

/** `#rrggbb` for the native picker, which cannot represent anything else. */
function toPickerValue(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : GCP_BLUE;
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
export function ColorField({
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

  // Normalised on the way out for the same reason `asColor` normalises
  // `set.json`: a typed `#4285F4` must be the same option value as a swatch.
  const commit = () => {
    const next = normaliseColor(draft);
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
        placeholder={GCP_BLUE}
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
