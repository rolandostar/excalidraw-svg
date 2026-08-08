import type {
  CardCorners,
  CardFillStyle,
  CardStrokeWidth,
  ExcalidrawOptions,
  LabelFontFamily,
  LabelPosition,
  Roughness,
} from '../types';

/**
 * Validation for option patches that come from `set.json`.
 *
 * Those files are hand-authored and not typechecked, so `labelFontFamily: 9`
 * or `cardCorners: "rounded-ish"` are one typo away at all times. An
 * unrecognised value is dropped and reported rather than merged: a silently
 * ignored field looks like the styling system is broken, and a silently
 * *accepted* one puts the UI into a state none of its controls can represent
 * or undo.
 */

const CARD_CORNERS: CardCorners[] = ['rounded', 'square'];
const CARD_FILL_STYLES: CardFillStyle[] = ['solid', 'hachure', 'cross-hatch'];
/** Excalidraw's `STROKE_WIDTH`: thin, bold, extraBold. */
const CARD_STROKE_WIDTHS: CardStrokeWidth[] = [1, 2, 4];
const LABEL_POSITIONS: LabelPosition[] = ['bottom', 'right', 'top'];
/** Excalidraw's real font ids; see the note on `LabelFontFamily`. */
const FONT_FAMILIES: LabelFontFamily[] = [5, 6, 7, 8, 9];
const ROUGHNESS: Roughness[] = [0, 1, 2];

/** Bounds match the sidebar sliders, so every accepted value is reachable in the UI. */
const FONT_SIZE = { min: 10, max: 28 };
const PADDING = { min: 0, max: 32 };
const ICON_SCALES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

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

const asColor: Validator = v => (isColor(v) ? v.trim() : undefined);

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
