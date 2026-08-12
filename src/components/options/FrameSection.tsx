import { Frame } from 'lucide-react';
import type { CardCorners, CardFillStyle, CardStrokeWidth } from '../../types/options';
import { Segments, Slider, Switch } from './controls';
import { ColorField } from './ColorField';
import { BG_COLORS, STROKE_COLORS } from './palette';
import { ROUGHNESS_LABELS, ROUGHNESS_VALUES } from './labels';
import type { SectionProps } from './useStyleOptions';

/**
 * The card drawn behind the artwork: corners, stroke, fill, colours, padding.
 *
 * Every control below the switch is hidden while the frame is off, because
 * none of them produce a visible result in that state. The pairing rules
 * between fill style and background colour are not enforced here - they belong
 * to `useStyleOptions`, which routes them through `normaliseOptions`.
 */
export function FrameSection({ options, style }: SectionProps) {
  return (
    <section className="opt-section">
      <h3 className="opt-heading">
        <Frame size={14} aria-hidden="true" />
        Frame
      </h3>

      <Switch label="Show card frame" checked={options.showCard} onChange={style.setShowCard} />

      {options.showCard && (
        <>
          <Segments
            label="Corners"
            values={['rounded', 'square'] as const satisfies readonly CardCorners[]}
            current={options.cardCorners}
            render={c => (c === 'rounded' ? 'Rounded' : 'Square')}
            onSelect={c => style.updateOption('cardCorners', c)}
          />

          <Segments
            label="Stroke width"
            values={[1, 2, 4] as const satisfies readonly CardStrokeWidth[]}
            current={options.cardStrokeWidth}
            render={w => (w === 1 ? 'Thin' : w === 2 ? 'Bold' : 'Extra')}
            onSelect={w => style.updateOption('cardStrokeWidth', w)}
          />

          <Segments
            label="Fill"
            values={['solid', 'hachure', 'cross-hatch'] as const satisfies readonly CardFillStyle[]}
            current={options.cardFillStyle}
            render={f => (f === 'solid' ? 'Solid' : f === 'hachure' ? 'Hachure' : 'Cross')}
            onSelect={style.setFillStyle}
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
            onChange={style.setBgColor}
          />

          <ColorField
            label="Stroke"
            palette={STROKE_COLORS}
            value={options.cardStrokeColor}
            onChange={c => style.updateOption('cardStrokeColor', c)}
          />

          <Segments
            label="Roughness"
            values={ROUGHNESS_VALUES}
            current={options.cardRoughness}
            render={r => ROUGHNESS_LABELS[r]}
            onSelect={r => style.updateOption('cardRoughness', r)}
          />

          <Slider
            label="Padding"
            value={options.padding}
            display={`${options.padding}px`}
            min={0}
            max={32}
            step={2}
            ariaLabel="Inner padding"
            onChange={v => style.updateOption('padding', v)}
          />

          <Switch
            label="Fit to artwork"
            checked={options.fitFrame}
            onChange={v => style.updateOption('fitFrame', v)}
            hint="Sizes the frame to the icon's real ink instead of its viewBox, removing the dead space around artwork that does not fill the square. Cards end up different sizes."
          />
        </>
      )}
    </section>
  );
}
