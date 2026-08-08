import React from 'react';

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
