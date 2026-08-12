import { Type } from 'lucide-react';
import { FONT_SIZE, LABEL_POSITIONS } from '../../types/options';
import { Field, Segments, Slider, Switch } from './controls';
import { ColorField } from './ColorField';
import { TEXT_COLORS } from './palette';
import { FONT_NAMES, FONT_VALUES, POSITION_LABELS } from './labels';
import type { SectionProps } from './useStyleOptions';

/**
 * The caption drawn with the icon: whether there is one, where it sits, and
 * how it is set.
 *
 * The font grid is a grid rather than a `<Segments>` because each button
 * previews its own face - `data-font` is what the stylesheet keys on - and
 * five faces do not fit on one segmented row at sidebar width.
 */
export function LabelSection({ options, style }: SectionProps) {
  return (
    <section className="opt-section">
      <h3 className="opt-heading">
        <Type size={14} aria-hidden="true" />
        Label
      </h3>

      <Switch
        label="Show label"
        checked={options.showLabel}
        onChange={v => style.updateOption('showLabel', v)}
      />

      {options.showLabel && (
        <>
          <Segments
            label="Position"
            values={LABEL_POSITIONS}
            current={options.labelPosition}
            render={p => POSITION_LABELS[p]}
            onSelect={p => style.updateOption('labelPosition', p)}
          />

          <Field label="Font">
            <div className="font-grid">
              {FONT_VALUES.map(font => (
                <button
                  key={font}
                  type="button"
                  className={`font-btn${options.labelFontFamily === font ? ' is-active' : ''}`}
                  data-font={font}
                  onClick={() => style.updateOption('labelFontFamily', font)}
                  aria-pressed={options.labelFontFamily === font}
                >
                  {FONT_NAMES[font]}
                </button>
              ))}
            </div>
          </Field>

          <Slider
            label="Size"
            value={options.labelFontSize}
            display={`${options.labelFontSize}px`}
            min={FONT_SIZE.min}
            max={FONT_SIZE.max}
            step={1}
            ariaLabel="Label font size"
            onChange={v => style.updateOption('labelFontSize', v)}
          />

          <ColorField
            label="Colour"
            palette={TEXT_COLORS}
            value={options.labelColor}
            onChange={c => style.updateOption('labelColor', c)}
          />
        </>
      )}
    </section>
  );
}
