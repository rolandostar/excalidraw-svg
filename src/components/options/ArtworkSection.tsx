import { Sliders } from 'lucide-react';
import { ICON_SCALES } from '../../types/options';
import { ICON_BASE_SIZE } from '../../utils/defaultOptions';
import { Segments, Slider } from './controls';
import { ROUGHNESS_LABELS, ROUGHNESS_VALUES } from './labels';
import type { SectionProps } from './useStyleOptions';

/**
 * Everything that applies to the icon itself, with or without a frame.
 *
 * Deliberately before Frame, and outside it. Icon roughness used to live
 * inside the frame section, gated on the frame being switched on - while the
 * value it set was applied to the artwork regardless. So sketchy icons were
 * unreachable without a card, and turning the card off left the icons sketchy
 * with no visible control explaining why.
 */
export function ArtworkSection({ options, style }: SectionProps) {
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
