import {
  CARD_CORNERS,
  CARD_FILL_STYLES,
  CARD_STROKE_WIDTHS,
  FONT_FAMILIES,
  LABEL_POSITIONS,
  ROUGHNESS,
  type ExcalidrawOptions,
} from '../types/options';

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
