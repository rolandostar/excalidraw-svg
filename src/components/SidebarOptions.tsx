import React from 'react';
import { ChevronDown, Frame, Sliders, Type, Wand2 } from 'lucide-react';
import type { ResolvedPreset } from '../types/icons';
import { GCP_BLUE, ICON_SCALES, type CardFillStyle, type ExcalidrawOptions } from '../types/options';
import { ICON_BASE_SIZE, normaliseOptions } from '../utils/defaultOptions';
import {
  BG_COLORS,
  ColorField,
  CORNER_LABELS,
  FILL_LABELS,
  Field,
  FONT_NAMES,
  FONT_VALUES,
  POSITION_LABELS,
  ROUGHNESS_LABELS,
  ROUGHNESS_VALUES,
  STROKE_COLORS,
  STROKE_WIDTH_LABELS,
  Segments,
  Slider,
  Switch,
  TEXT_COLORS,
} from './options/controls';
import {
  CARD_CORNERS,
  CARD_FILL_STYLES,
  CARD_STROKE_WIDTHS,
  FONT_SIZE,
  LABEL_POSITIONS,
  PADDING,
} from '../types/options';

/**
 * The styling panel: a collapsible shell around four sections.
 *
 * `useStyleOptions` is the only writer, and it is where the three "the
 * control does nothing" rules live - a visible card needs a visible stroke, a
 * hatch needs a background to hatch, a transparent background forces a solid
 * fill. Every setter routes through `normaliseOptions`, which is idempotent.
 */

// ---------------------------------------------------------------------------
// Writing options
// ---------------------------------------------------------------------------

/**
 * Every write the styling panel makes to `ExcalidrawOptions`.
 *
 * The three "the control does nothing" invariants - a visible card needs a
 * visible stroke, a hatch needs a background to hatch, a transparent
 * background forces a solid fill - used to exist in three places at once:
 * `normaliseOptions`, a pair of handlers in `SidebarOptions`, and a twelve
 * line anonymous updater passed inline as a JSX prop. The three had already
 * drifted, and the inline one was invisible from anywhere the rule mattered.
 *
 * `normaliseOptions` is now the only statement of them, and every setter here
 * routes through it. It is idempotent, so applying it to every write is free.
 */
function useStyleOptions(
  setOptions: React.Dispatch<React.SetStateAction<ExcalidrawOptions>>
) {
  const updateOption = React.useCallback(
    <K extends keyof ExcalidrawOptions>(key: K, value: ExcalidrawOptions[K]) => {
      setOptions(prev => (prev[key] === value ? prev : normaliseOptions({ ...prev, [key]: value })));
    },
    [setOptions]
  );

  /*
   * A hatched fill paints in the background colour, so it draws nothing over a
   * transparent background. Rather than let the control silently do nothing,
   * choosing a hatch gives the card a background if it has none - and the
   * background swatches stay free to take it back to transparent, which snaps
   * the fill back to solid. `normaliseOptions` enforces the same pairing for
   * values arriving from `set.json` and localStorage.
   *
   * The background has to be supplied *before* normalising: left transparent,
   * `normaliseOptions` would resolve the same conflict the other way and force
   * the fill straight back to solid, which is the control doing nothing again.
   */
  const setFillStyle = React.useCallback(
    (fillStyle: CardFillStyle) => {
      setOptions(prev =>
        normaliseOptions({
          ...prev,
          cardFillStyle: fillStyle,
          cardBgColor:
            fillStyle !== 'solid' && prev.cardBgColor === 'transparent'
              ? prev.cardStrokeColor !== 'transparent'
                ? prev.cardStrokeColor
                : GCP_BLUE
              : prev.cardBgColor,
        })
      );
    },
    [setOptions]
  );

  // Both of these are plain writes; the repair each one used to carry out by
  // hand is one of the rules `normaliseOptions` already applies.
  const setBgColor = React.useCallback(
    (cardBgColor: string) => updateOption('cardBgColor', cardBgColor),
    [updateOption]
  );

  const setShowCard = React.useCallback(
    (showCard: boolean) => updateOption('showCard', showCard),
    [updateOption]
  );

  return { updateOption, setFillStyle, setBgColor, setShowCard };
}

/** What a styling section needs to read and write. */
type StyleOptions = ReturnType<typeof useStyleOptions>;

interface SectionProps {
  options: ExcalidrawOptions;
  style: StyleOptions;
}

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
 * The card drawn behind the artwork: corners, stroke, fill, colours, padding.
 *
 * Every control below the switch is hidden while the frame is off, because
 * none of them produce a visible result in that state. The pairing rules
 * between fill style and background colour are not enforced here - they belong
 * to `useStyleOptions`, which routes them through `normaliseOptions`.
 */
// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function FrameSection({ options, style }: SectionProps) {
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
            values={CARD_CORNERS}
            current={options.cardCorners}
            render={c => CORNER_LABELS[c]}
            onSelect={c => style.updateOption('cardCorners', c)}
          />

          <Segments
            label="Stroke width"
            values={CARD_STROKE_WIDTHS}
            current={options.cardStrokeWidth}
            render={w => STROKE_WIDTH_LABELS[w]}
            onSelect={w => style.updateOption('cardStrokeWidth', w)}
          />

          <Segments
            label="Fill"
            values={CARD_FILL_STYLES}
            current={options.cardFillStyle}
            render={f => FILL_LABELS[f]}
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
            min={PADDING.min}
            max={PADDING.max}
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

/**
 * The caption drawn with the icon: whether there is one, where it sits, and
 * how it is set.
 *
 * The font grid is a grid rather than a `<Segments>` because each button
 * previews its own face - `data-font` is what the stylesheet keys on - and
 * five faces do not fit on one segmented row at sidebar width.
 */
function LabelSection({ options, style }: SectionProps) {
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

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

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
