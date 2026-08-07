import type { CardStyle, ExcalidrawOptions, LabelFontFamily, LabelPosition } from '../types';

/**
 * Validation for option patches that come from `set.json`.
 *
 * Those files are hand-authored and not typechecked, so `labelFontFamily: 9`
 * or `cardStyle: "rounded"` are one typo away at all times. An unrecognised
 * value is dropped and reported rather than merged: a silently ignored field
 * looks like the styling system is broken, and a silently *accepted* one puts
 * the UI into a state none of its controls can represent or undo.
 */

const CARD_STYLES: CardStyle[] = ['none', 'soft-card', 'sketch-box', 'outline'];
const LABEL_POSITIONS: LabelPosition[] = ['bottom', 'right', 'top', 'inside'];
const FONT_FAMILIES: LabelFontFamily[] = [1, 2, 3, 4, 5];

/** Bounds match the sidebar sliders, so every accepted value is reachable in the UI. */
const FONT_SIZE = { min: 10, max: 28 };
const PADDING = { min: 4, max: 24 };
const ICON_SCALES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const ROUGHNESS = [0, 1, 2];

type Validator = (value: unknown) => unknown | undefined;

const isString = (v: unknown) => (typeof v === 'string' ? v : undefined);
const isBool = (v: unknown) => (typeof v === 'boolean' ? v : undefined);

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
  cardStyle: oneOf(CARD_STYLES),
  roughness: oneOf(ROUGHNESS),
  cardBgColor: isString,
  cardStrokeColor: isString,
  showLabel: isBool,
  labelPosition: oneOf(LABEL_POSITIONS),
  labelFontFamily: oneOf(FONT_FAMILIES),
  labelFontSize: inRange(FONT_SIZE.min, FONT_SIZE.max),
  labelColor: isString,
  iconScale: oneOf(ICON_SCALES),
  padding: inRange(PADDING.min, PADDING.max),
};

const KNOWN_KEYS = Object.keys(VALIDATORS) as (keyof ExcalidrawOptions)[];

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
