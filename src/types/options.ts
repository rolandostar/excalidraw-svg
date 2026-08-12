/**
 * Owns the styling options a set or a user chooses, and the allow-lists they
 * are validated against.
 *
 * Separate from the icon and Excalidraw types because this is the only domain
 * with a runtime half. `set.json` is hand-authored and not typechecked, so
 * every union below also has to exist as an array `optionsSchema.ts` can test
 * membership in.
 *
 * **The arrays are the source of truth; the unions are derived from them.**
 * It used to be the other way round - the unions here, six matching arrays
 * over in `optionsSchema.ts` - with nothing linking the two, so adding a value
 * meant remembering to edit both files and the compiler could not tell you if
 * you forgot. Adding a member to an array below now widens the type and the
 * validator in one edit.
 */

/**
 * The frame is described by the properties Excalidraw actually has, not by
 * named looks.
 *
 * There used to be a `CardStyle` union - `soft-card` / `sketch-box` /
 * `outline` - and it conflated three independent things: corner radius,
 * stroke weight and fill style. That made some combinations unreachable (a
 * rounded hachure card, an outline with a background) and one combination a
 * lie: `outline` hardcoded `backgroundColor: 'transparent'`, so the background
 * swatch silently did nothing whenever it was selected.
 *
 * Splitting them also removed a whole class of dead style: `badge` was dropped
 * earlier because Excalidraw's `getCornerRadius` returns `shorterSide * 0.25`
 * for both PROPORTIONAL_RADIUS and ADAPTIVE_RADIUS below 128 units, making it
 * byte-identical to `soft-card`.
 */
export const CARD_CORNERS = ['rounded', 'square'] as const;
export type CardCorners = (typeof CARD_CORNERS)[number];

/**
 * Excalidraw's `FillStyle`, minus `zigzag`.
 *
 * `zigzag` exists in the renderer but is not in Excalidraw's own fill picker -
 * it is reachable only by double-clicking hachure - so offering it here would
 * produce cards no one can reproduce by hand in the editor.
 *
 * A hachure or cross-hatch fill draws nothing over a transparent background.
 * `normaliseOptions` and `auditSceneFidelity` both guard against that pairing.
 */
export const CARD_FILL_STYLES = ['solid', 'hachure', 'cross-hatch'] as const;
export type CardFillStyle = (typeof CARD_FILL_STYLES)[number];

/** Excalidraw's `STROKE_WIDTH`: thin, bold, extraBold. */
export const CARD_STROKE_WIDTHS = [1, 2, 4] as const;
export type CardStrokeWidth = (typeof CARD_STROKE_WIDTHS)[number];

/** Excalidraw's `ROUGHNESS`: architect, artist, cartoonist. */
export const ROUGHNESS = [0, 1, 2] as const;
export type Roughness = (typeof ROUGHNESS)[number];

/**
 * `inside` was removed. It claimed to place the label over the artwork but
 * only changed the icon-to-label gap from 8 units to 4, so it was
 * indistinguishable from `bottom` in every export. A stored `'inside'`
 * migrates to `'bottom'`.
 */
export const LABEL_POSITIONS = ['bottom', 'right', 'top'] as const;
export type LabelPosition = (typeof LABEL_POSITIONS)[number];

/**
 * Excalidraw's real `FONT_FAMILY` ids, from `@excalidraw/common`:
 *
 *   Virgil 1, Helvetica 2, Cascadia 3, (4 unused),
 *   Excalifont 5, Nunito 6, Lilita One 7, Comic Shanns 8, Liberation Sans 9
 *
 * This used to be `1 | 2 | 3 | 4 | 5` with its own private meanings, which is
 * why "Lilita One" never worked: id 4 is permanently unused - Excalidraw's
 * comment says it was Assistant and before that a custom Obsidian font - so
 * `getFontFamilyString` found no match and returned the Windows emoji
 * fallback. Id 5 meant Nunito here and Excalifont there, so that one rendered
 * as the wrong font rather than no font.
 *
 * Only the five non-deprecated faces are offered. Virgil, Helvetica and
 * Cascadia are all flagged `deprecated: true` in Excalidraw's `FONT_METADATA`,
 * and Helvetica is additionally `local: true`, so it renders differently on
 * every machine.
 */
export const FONT_FAMILIES = [5, 6, 7, 8, 9] as const;
export type LabelFontFamily = (typeof FONT_FAMILIES)[number];

/*
 * The three numeric ranges, stated once for the validator and the slider that
 * has to be able to reach every value it accepts.
 *
 * `ICON_SCALES` is an enumeration rather than a range because the readout
 * names a pixel size, and a continuous slider would offer sizes like 91.2px.
 * The slider derives its min, max and step from the array, so the two cannot
 * describe different sets of values.
 */
export const FONT_SIZE = { min: 10, max: 28 };
export const PADDING = { min: 0, max: 32 };
export const ICON_SCALES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/**
 * The accent every fallback reaches for, and the one colour literal that is
 * allowed to appear in more than one module.
 *
 * Lowercase, and every colour entering the options object is lowercased to
 * match, because presets are compared by value: `sameOptions` is a `===` over
 * the fields, so a set declaring `#4285F4` against a default of `#4285f4`
 * describes the same colour and never matches.
 */
export const GCP_BLUE = '#4285f4';

export interface ExcalidrawOptions {
  // --- frame ---
  showCard: boolean;
  cardCorners: CardCorners;
  cardStrokeWidth: CardStrokeWidth;
  cardFillStyle: CardFillStyle;
  cardBgColor: string; // any CSS colour, or 'transparent'
  cardStrokeColor: string;
  cardRoughness: Roughness;
  padding: number; // card inner padding
  /**
   * Size the frame to the artwork's real ink box instead of the nominal
   * `ICON_BASE_SIZE * iconScale` square.
   *
   * Off by default because it makes cards different sizes across a grid: the
   * nominal box is the source viewBox, and how much of it a given icon
   * actually inks varies. On, the frame matches what is really pasted.
   */
  fitFrame: boolean;

  // --- artwork ---
  /**
   * Separate from `cardRoughness`. One shared value used to drive both, while
   * the only control for it was nested inside the frame section - so the
   * artwork's roughness could not be changed without a frame, and could not be
   * left clean when the frame was sketchy.
   */
  iconRoughness: Roughness;
  iconScale: number; // multiplier on ICON_BASE_SIZE: 1.0 = 96px, 2.0 = 192px

  // --- label ---
  showLabel: boolean;
  labelPosition: LabelPosition;
  labelFontFamily: LabelFontFamily;
  labelFontSize: number;
  labelColor: string;
}
