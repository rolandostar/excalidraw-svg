import React from 'react';
import { Check, Plus } from 'lucide-react';
import { isColor } from '../../utils/optionsSchema';
import { COLOR_NAMES, isLightColor, withCurrent } from './palette';

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
