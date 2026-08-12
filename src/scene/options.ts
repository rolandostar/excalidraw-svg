import {
  CARD_CORNERS,
  CARD_FILL_STYLES,
  CARD_STROKE_WIDTHS,
  FONT_FAMILIES,
  FONT_SIZE,
  GCP_BLUE,
  ICON_SCALES,
  LABEL_POSITIONS,
  PADDING,
  ROUGHNESS,
  type ExcalidrawOptions,
  type LabelFontFamily,
} from '../types/options';

/**
 * The styling options a scene is built with: their defaults, the repairs that
 * keep them describing something visible, the v1 migration, and the validator
 * that untrusted `set.json` and localStorage pass through.
 *
 *   defaults    what an unconfigured set exports with
 *   repair      the "the control does nothing" rules
 *   migration   v1 storage -> v2
 *   validation  one validator per field, and the sanitiser over them
 */

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * Edge length in Excalidraw canvas units of an icon at `iconScale: 1`.
 *
 * Sized against Excalidraw's default 20px text: below about 96 a pasted icon
 * reads as a bullet point rather than a diagram node. Card sizing, grid pitch
 * and the sidebar readout are all derived from it.
 */
export const ICON_BASE_SIZE = 96;

/**
 * Single source of truth for the default export settings.
 *
 * The icon library UI and the fidelity harness BOTH read from here. If they
 * drift apart, the comparison dashboard stops describing what actually lands
 * on the clipboard, which is exactly the class of bug this module prevents.
 */
export const DEFAULT_EXCALIDRAW_OPTIONS: ExcalidrawOptions = {
  showCard: false,
  /*
   * Inert while `showCard` is false - `createExcalidrawItem` emits no
   * rectangle at all - but they are what you get the instant you switch the
   * frame on, so they have to be values that draw something. Two
   * `transparent`s here make the frame toggle look broken.
   */
  cardCorners: 'rounded',
  cardStrokeWidth: 1,
  cardFillStyle: 'solid',
  cardBgColor: 'transparent',
  cardStrokeColor: GCP_BLUE,
  cardRoughness: 0,
  padding: 8,
  /*
   * Off by default: a uniform grid of equally sized cards is what people
   * expect when they paste a whole set, and fitting each frame to its own ink
   * box makes them visibly different sizes. Worth switching on for a single
   * icon, where the dead space around the artwork is the thing you notice.
   */
  fitFrame: false,

  iconRoughness: 0,
  iconScale: 1.0,

  /*
   * Off, so a set opens as a grid of marks at one consistent size.
   *
   * The card is sized around its label, and label widths vary with the name -
   * "API" against "Managed Service For Microsoft Active Directory" is a 96
   * unit card against a 424 unit one. Since the grid draws each card to scale,
   * labels on by default meant the very first screen showed the same artwork
   * at a range of sizes, which reads as inconsistent rendering rather than as
   * a consequence of the names.
   *
   * The three shipped sets each declare this too, so changing it here only
   * affects a set folder with no `set.json`. Every set offers a "Labelled"
   * preset one click away.
   */
  showLabel: false,
  labelPosition: 'bottom',
  // Inert while `showLabel` is false, but these are what the label looks like
  // the instant it is switched on. Excalifont at the size Excalidraw itself
  // calls Medium: a pasted icon lands next to hand-drawn text far more often
  // than next to a normal sans, and 12px read as a footnote beside a 96px
  // icon.
  labelFontFamily: 5,
  labelFontSize: 18,
  labelColor: '#94a3b8',
};

/**
 * Excalidraw's `LINE_CONFIRM_THRESHOLD` (packages/common/src/constants.ts).
 *
 * A `line` element is only ever filled with its `backgroundColor` when
 * `isPathALoop(points)` is true, i.e. when the distance between the first and
 * the last point is <= this threshold. Any generated polygon that is meant to
 * be a filled region MUST therefore be emitted as a closed ring.
 */
export const LINE_CONFIRM_THRESHOLD = 8;

/**
 * Repairs option objects that are structurally valid but describe a frame
 * nobody can see. From the outside an invisible result and an ignored setting
 * look identical, so each of these reads as "the control does nothing".
 */
export function normaliseOptions(options: ExcalidrawOptions): ExcalidrawOptions {
  let next = options;

  // Stroke and fill both invisible is indistinguishable from the frame toggle
  // being broken.
  if (next.showCard && next.cardStrokeColor === 'transparent' && next.cardBgColor === 'transparent') {
    next = { ...next, cardStrokeColor: GCP_BLUE };
  }

  // Rough.js hatches the *fill*, so hachure and cross-hatch draw nothing at
  // all over a transparent background.
  if (next.cardFillStyle !== 'solid' && next.cardBgColor === 'transparent') {
    next = { ...next, cardFillStyle: 'solid' };
  }

  return next;
}

/**
 * Storage schema version for `icons.<set>.options`.
 *
 * Bumped when the shape of `ExcalidrawOptions` changes in a way `asPartialOf`
 * cannot detect. `asPartialOf` compares `typeof` against the defaults, so it
 * drops keys the defaults no longer have - fine - but it happily keeps a key
 * whose *meaning* changed while its type did not. `labelFontFamily` is exactly
 * that: every v1 value is a number and every v2 value is a number, but v1's
 * `5` meant Nunito and v2's `5` means Excalifont.
 */
export const OPTIONS_STORAGE_VERSION = 2;

/** v1 `cardStyle` -> the three independent properties that replaced it. */
const V1_CARD_STYLES: Record<string, Pick<ExcalidrawOptions, 'cardCorners' | 'cardStrokeWidth' | 'cardFillStyle'>> = {
  'soft-card': { cardCorners: 'rounded', cardStrokeWidth: 1, cardFillStyle: 'solid' },
  'sketch-box': { cardCorners: 'square', cardStrokeWidth: 1, cardFillStyle: 'hachure' },
  outline: { cardCorners: 'square', cardStrokeWidth: 2, cardFillStyle: 'solid' },
  // `none` suppressed the rectangle while `showCard` was true; `badge` was
  // identical to soft-card. Both now resolve to soft-card.
  none: { cardCorners: 'rounded', cardStrokeWidth: 1, cardFillStyle: 'solid' },
  badge: { cardCorners: 'rounded', cardStrokeWidth: 1, cardFillStyle: 'solid' },
};

/**
 * v1 font id -> the real Excalidraw id it was trying to name.
 *
 * v1's ids were invented locally. Helvetica has no v2 equivalent worth
 * offering - deprecated and `local: true` - so it maps to Liberation Sans,
 * which is Excalidraw's bundled normal-sans and metric-compatible with Arial.
 */
const V1_FONTS: Record<number, LabelFontFamily> = {
  1: 5, // Excalifont, via the deprecated Virgil alias
  2: 9, // Helvetica -> Liberation Sans
  3: 8, // Comic Shanns, via the deprecated Cascadia alias
  4: 7, // Lilita One - never rendered; this is the bug being fixed
  5: 6, // Nunito - rendered as Excalifont in v1
};

const numberAt = (source: Record<string, unknown>, key: string): number | undefined =>
  typeof source[key] === 'number' && Number.isFinite(source[key]) ? (source[key] as number) : undefined;

/**
 * Rewrites a v1 options object into v2 shape.
 *
 * Runs on the raw stored value, *before* `asPartialOf`, which would otherwise
 * throw away `cardStyle` and `roughness` (keys the v2 defaults do not have)
 * and keep `labelFontFamily` at a number that now means a different font.
 *
 * Unknown or malformed fields are simply left out, so the merge against the
 * set's defaults fills them in. This never throws: it is parsing localStorage.
 */
export function migrateOptionsV1(raw: unknown): Partial<ExcalidrawOptions> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};

  const source = raw as Record<string, unknown>;
  const out: Partial<ExcalidrawOptions> = {};

  const cardStyle = typeof source.cardStyle === 'string' ? V1_CARD_STYLES[source.cardStyle] : undefined;
  if (cardStyle) Object.assign(out, cardStyle);

  // One v1 value drove the frame *and* the artwork, so both inherit it. That
  // preserves what the user was actually looking at; they can separate the two
  // afterwards, which is the point of the change.
  const roughness = numberAt(source, 'roughness');
  if (roughness === 0 || roughness === 1 || roughness === 2) {
    out.cardRoughness = roughness;
    out.iconRoughness = roughness;
  }

  const font = numberAt(source, 'labelFontFamily');
  if (font !== undefined && V1_FONTS[font]) out.labelFontFamily = V1_FONTS[font];

  if (source.labelPosition === 'inside') out.labelPosition = 'bottom';

  return out;
}

/**
 * True when a stored object predates `OPTIONS_STORAGE_VERSION`.
 *
 * Detected structurally rather than from a version field, because v1 never
 * wrote one. `cardStyle` and `roughness` are both v1-only keys.
 */
export function looksLikeV1Options(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  const source = raw as Record<string, unknown>;
  return 'cardStyle' in source || 'roughness' in source;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validation for option patches that come from `set.json`.
 *
 * Those files are hand-authored and not typechecked, so `labelFontFamily: 9`
 * or `cardCorners: "rounded-ish"` are one typo away at all times. An
 * unrecognised value is dropped and reported rather than merged: a silently
 * ignored field looks like the styling system is broken, and a silently
 * *accepted* one puts the UI into a state none of its controls can represent
 * or undo.
 *
 * The six allow-lists this validates against used to be declared here as a
 * second copy of the unions in `types/options.ts`, with nothing linking the
 * two. They are now imported: the array is the source of truth and the union
 * is derived from it, so a new value cannot be added to one and missed in the
 * other. The prose explaining each one lives with the array.
 */

type Validator = (value: unknown) => unknown | undefined;

const isBool = (v: unknown) => (typeof v === 'boolean' ? v : undefined);

/**
 * Colours are validated by shape rather than accepted as any string.
 *
 * `isString` used to be enough because the only writers were three curated
 * palettes. The custom-colour field means a user can now type into these, and
 * an unparseable value does not fail loudly - canvas silently paints it black,
 * so a typo reads as "the colour picker is broken".
 *
 * Deliberately narrower than CSS: hex in all four lengths, the functional
 * notations, and `transparent`. Bare colour keywords are rejected because
 * there is no way to tell `rebeccapurple` from `rebecapurple` without a full
 * keyword table, and neither the palettes nor the picker can produce one.
 */
const COLOR_PATTERN =
  /^(?:transparent|#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgb|hsl)a?\([^()]*\))$/i;

export const isColor = (v: unknown): v is string =>
  typeof v === 'string' && COLOR_PATTERN.test(v.trim());

/**
 * The single point where a colour becomes an option value.
 *
 * Lowercased because `sameOptions` compares options with `===`: a `set.json`
 * declaring `#4285F4` names the same colour as a default of `#4285f4` and
 * would otherwise never match the preset it belongs to. Safe over the whole
 * grammar `COLOR_PATTERN` accepts - hex, `rgb()`/`hsl()` and `transparent`
 * are all case-insensitive.
 */
export const normaliseColor = (value: string): string => value.trim().toLowerCase();

const asColor: Validator = v => (isColor(v) ? normaliseColor(v) : undefined);

const oneOf =
  <T>(allowed: readonly T[]): Validator =>
  v =>
    (allowed as readonly unknown[]).includes(v) ? v : undefined;

const inRange =
  (min: number, max: number): Validator =>
  v =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : undefined;

const VALIDATORS: Record<keyof ExcalidrawOptions, Validator> = {
  showCard: isBool,
  cardCorners: oneOf(CARD_CORNERS),
  cardStrokeWidth: oneOf(CARD_STROKE_WIDTHS),
  cardFillStyle: oneOf(CARD_FILL_STYLES),
  cardBgColor: asColor,
  cardStrokeColor: asColor,
  cardRoughness: oneOf(ROUGHNESS),
  padding: inRange(PADDING.min, PADDING.max),
  fitFrame: isBool,

  iconRoughness: oneOf(ROUGHNESS),
  iconScale: oneOf(ICON_SCALES),

  showLabel: isBool,
  labelPosition: oneOf(LABEL_POSITIONS),
  labelFontFamily: oneOf(FONT_FAMILIES),
  labelFontSize: inRange(FONT_SIZE.min, FONT_SIZE.max),
  labelColor: asColor,
};

const KNOWN_KEYS = Object.keys(VALIDATORS) as (keyof ExcalidrawOptions)[];

/**
 * Keys that existed in the v1 options schema.
 *
 * Reported as "no longer supported" rather than "unknown", so an author who
 * copied a preset out of an older `set.json` is told what replaced it instead
 * of being left to guess at a typo.
 */
const RETIRED_KEYS: Record<string, string> = {
  cardStyle: 'replaced by cardCorners, cardStrokeWidth and cardFillStyle',
  roughness: 'split into cardRoughness and iconRoughness',
};

/**
 * Keeps only recognised keys holding usable values.
 *
 * `where` is used purely for the warning, so a bad field can be traced back to
 * the file that declared it without opening every manifest.
 */
export function sanitizeOptionsPatch(raw: unknown, where: string): Partial<ExcalidrawOptions> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};

  const input = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (RETIRED_KEYS[key]) {
      warn(`${where}: "${key}" is no longer supported - ${RETIRED_KEYS[key]}`);
      continue;
    }

    if (!KNOWN_KEYS.includes(key as keyof ExcalidrawOptions)) {
      warn(`${where}: unknown styling option "${key}"`);
      continue;
    }

    const accepted = VALIDATORS[key as keyof ExcalidrawOptions](value);
    if (accepted === undefined) {
      warn(`${where}: "${key}" cannot be ${JSON.stringify(value)}`);
      continue;
    }

    out[key] = accepted;
  }

  return out as Partial<ExcalidrawOptions>;
}

/**
 * Dev-only, and safe outside Vite: `import.meta.env` is undefined under plain
 * Node, which is how the build plugin and any tooling import this module.
 */
function warn(message: string): void {
  if (import.meta.env?.DEV) console.warn(`[icon-sets] ${message}`);
}
