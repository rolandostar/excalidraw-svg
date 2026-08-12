import React from 'react';
import { GCP_BLUE, type CardFillStyle, type ExcalidrawOptions } from '../../types';
import { normaliseOptions } from '../../utils/defaultOptions';

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
export function useStyleOptions(
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
export type StyleOptions = ReturnType<typeof useStyleOptions>;

export interface SectionProps {
  options: ExcalidrawOptions;
  style: StyleOptions;
}

/**
 * Presets are compared by value, not tracked by id.
 *
 * Storing "which preset is active" would go stale the moment any individual
 * control was touched, and would then claim a look the grid is not showing.
 */
export function sameOptions(a: ExcalidrawOptions, b: ExcalidrawOptions): boolean {
  return (Object.keys(a) as (keyof ExcalidrawOptions)[]).every(k => a[k] === b[k]);
}
