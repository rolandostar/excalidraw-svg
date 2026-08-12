import { type ExcalidrawOptions, GCP_BLUE, type LabelFontFamily } from '../types/options';

/**
 * Edge length in Excalidraw canvas units of an icon at `iconScale: 1`.
 *
 * 48 was too small in practice: pasted next to default 20px Excalidraw text an
 * icon read as a bullet point rather than a diagram node, and every user's
 * first action was to scale it up. 96 is the size people were choosing anyway,
 * so it is now what 1x means.
 *
 * Everything downstream is derived from this - card sizing, grid pitch and the
 * sidebar readout - so changing it here changes them together.
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
   * frame on, so they have to be values that draw something.
   *
   * The colours used to default to two `transparent`s, which meant enabling
   * the frame produced a rectangle with no stroke and no fill: the control
   * appeared to do nothing, and so did every style button behind it.
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
 * nobody can see.
 *
 * Every one of these has been reported as "the control does nothing", because
 * from the outside an invisible result and an ignored setting look identical.
 */
export function normaliseOptions(options: ExcalidrawOptions): ExcalidrawOptions {
  let next = options;

  // Stroke and fill both invisible is indistinguishable from the frame toggle
  // being broken.
  if (next.showCard && next.cardStrokeColor === 'transparent' && next.cardBgColor === 'transparent') {
    next = { ...next, cardStrokeColor: GCP_BLUE };
  }

  // Rough.js hatches the *fill*, so hachure and cross-hatch draw nothing at
  // all over a transparent background. Every shipped "Sketch" preset had this
  // exact pairing and had therefore never once rendered a hatch.
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
  // `none` suppressed the rectangle while `showCard` was true, which made the
  // toggle look broken; `badge` was removed for being identical to soft-card.
  none: { cardCorners: 'rounded', cardStrokeWidth: 1, cardFillStyle: 'solid' },
  badge: { cardCorners: 'rounded', cardStrokeWidth: 1, cardFillStyle: 'solid' },
};

/**
 * v1 font id -> the real Excalidraw id it was trying to name.
 *
 * v1's ids were invented locally and only three of them happened to be right.
 * `4` resolved to nothing at all (Excalidraw leaves 4 permanently unused), and
 * `2` named Helvetica, which is deprecated and `local: true` - Liberation Sans
 * is Excalidraw's current bundled normal-sans and is metric-compatible with
 * Arial, so it is the honest replacement.
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
