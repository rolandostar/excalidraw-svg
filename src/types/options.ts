/**
 * Owns the styling options a set or a user chooses, and the allow-lists they
 * are validated against.
 *
 * **The arrays are the source of truth; the unions are derived from them.**
 * Adding a member to an array below widens the type, the validator and the
 * control that offers it in one edit, and fails the build at the label table
 * in `options/labels.ts` until it is named.
 */

/**
 * The frame is described by the properties Excalidraw actually has, not by
 * named looks, so every combination of them is reachable.
 *
 * Two radii only: Excalidraw's `getCornerRadius` returns `shorterSide * 0.25`
 * for both PROPORTIONAL_RADIUS and ADAPTIVE_RADIUS below 128 units, so a
 * third "badge" rounding would be byte-identical to `rounded`.
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

/** A stored `'inside'` migrates to `'bottom'`; see `migrateOptionsV1`. */
export const LABEL_POSITIONS = ['bottom', 'right', 'top'] as const;
export type LabelPosition = (typeof LABEL_POSITIONS)[number];

/**
 * Excalidraw's real `FONT_FAMILY` ids, from `@excalidraw/common`:
 *
 *   Virgil 1, Helvetica 2, Cascadia 3, (4 unused),
 *   Excalifont 5, Nunito 6, Lilita One 7, Comic Shanns 8, Liberation Sans 9
 *
 * Id 4 is permanently unused, so `getFontFamilyString` finds no match for it
 * and returns the Windows emoji fallback.
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
  /** Separate from `cardRoughness`: sketchy artwork must not require a frame. */
  iconRoughness: Roughness;
  iconScale: number; // multiplier on ICON_BASE_SIZE: 1.0 = 96px, 2.0 = 192px

  // --- label ---
  showLabel: boolean;
  labelPosition: LabelPosition;
  labelFontFamily: LabelFontFamily;
  labelFontSize: number;
  labelColor: string;
}
