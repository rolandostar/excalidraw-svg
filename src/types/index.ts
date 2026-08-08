export interface IconAsset {
  /** Unique across the whole site: `<setId>/<name>`. */
  id: string;
  /** Which set this came from, i.e. the folder name under `svg/`. */
  setId: string;
  name: string; // original filename without extension, e.g. "Cloud-Run"
  title: string; // clean display title, e.g. "Cloud Run"
  category: string; // a category id declared by the set, or 'general'
  tags: string[];
  rawSvg: string;
  optimizedSvg: string;
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * A filter chip. Display only - the matching lives in `IconCategoryRule`, so
 * several rules can feed one bucket without the bucket appearing twice.
 */
export interface IconCategory {
  id: string;
  name: string;
  description?: string;
  /** Chip/badge accent. Falls back to the set accent. */
  color?: string;
}

/**
 * One ordered, first-wins classification rule.
 *
 * `match` entries are substring-tested against the lowercased filename. The
 * first rule that hits decides the category; anything unmatched falls through
 * to the last declared category.
 */
export interface IconCategoryRule {
  category: string;
  match: string[];
}

/**
 * A named styling preset declared by a set.
 *
 * `options` is a *patch*: only the fields it changes need stating, and it is
 * merged over the set's `defaults`, which are themselves merged over
 * `DEFAULT_EXCALIDRAW_OPTIONS`. Authors therefore write the two or three
 * things that make the preset interesting, not all twelve.
 */
export interface IconSetPreset {
  id: string;
  label: string;
  /** Tooltip. One short line describing what the preset is for. */
  hint?: string;
  options: Partial<ExcalidrawOptions>;
}

/** A preset with every field filled in, ready to hand to `setOptions`. */
export interface ResolvedPreset {
  id: string;
  label: string;
  hint?: string;
  options: ExcalidrawOptions;
}

/**
 * `svg/<set-id>/set.json`.
 *
 * Every field is optional. Dropping a bare folder of SVGs into `svg/` with no
 * manifest at all has to produce a working, browsable set - requiring
 * boilerplate before an icon shows up would defeat the point of the drop.
 */
export interface IconSetManifest {
  /** Display name. Defaults to a title-cased folder name. */
  name?: string;
  description?: string;
  /** Attribution / upstream URL, shown on the gallery card. */
  source?: string;
  sourceUrl?: string;
  license?: string;
  /** Accent colour for the gallery card and default chip colour. */
  accent?: string;
  /** Lower sorts first in the gallery. Unset sorts after everything numbered. */
  order?: number;
  /** Added to the search tags of every icon in the set. */
  tags?: string[];
  /**
   * The look this set opens with, as a patch over `DEFAULT_EXCALIDRAW_OPTIONS`.
   * Flat product marks and hand-drawn category badges do not want the same
   * label font, so the sensible starting point belongs with the set.
   */
  defaults?: Partial<ExcalidrawOptions>;
  /** Preset buttons in the styling sidebar. Omit to get a generic built-in set. */
  presets?: IconSetPreset[];
  categories?: IconCategory[];
  rules?: IconCategoryRule[];
  /**
   * Bidirectional search-alias groups: any term in a group finds any other.
   * `["vpc", "virtual private cloud"]` makes the VPC icon reachable by either.
   */
  synonyms?: string[][];
  /** Per-file corrections, keyed by filename without the extension. */
  overrides?: Record<string, { title?: string; category?: string; tags?: string[] }>;
}

/** A discovered set before its icons have been optimised. */
export interface IconSetSummary {
  id: string;
  name: string;
  description?: string;
  source?: string;
  sourceUrl?: string;
  license?: string;
  accent: string;
  order: number;
  count: number;
  /** Fully resolved and validated; what the set opens with. */
  defaults: ExcalidrawOptions;
  /** Fully resolved and validated; always contains a "Default" entry. */
  presets: ResolvedPreset[];
  categories: IconCategory[];
  /** Whether `set.json` was present, or everything was inferred. */
  hasManifest: boolean;
  /** Cheap unoptimised data URLs for the gallery card, source order. */
  previews: string[];
}

export interface IconSet extends IconSetSummary {
  icons: IconAsset[];
}

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
export type CardCorners = 'rounded' | 'square';

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
export type CardFillStyle = 'solid' | 'hachure' | 'cross-hatch';

/** Excalidraw's `STROKE_WIDTH`: thin, bold, extraBold. */
export type CardStrokeWidth = 1 | 2 | 4;

/** Excalidraw's `ROUGHNESS`: architect, artist, cartoonist. */
export type Roughness = 0 | 1 | 2;

/**
 * `inside` was removed. It claimed to place the label over the artwork but
 * only changed the icon-to-label gap from 8 units to 4, so it was
 * indistinguishable from `bottom` in every export. A stored `'inside'`
 * migrates to `'bottom'`.
 */
export type LabelPosition = 'bottom' | 'right' | 'top';

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
export type LabelFontFamily = 5 | 6 | 7 | 8 | 9;

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

export interface ExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: string;
  strokeWidth: number;
  strokeStyle: string;
  roughness: number;
  opacity: number;
  groupIds: string[];
  frameId: null;
  index: string;
  roundness: { type: number } | null;
  seed: number;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: any[] | null;
  updated: number;
  link: null;
  locked: boolean;
  // Specific for line/polygon
  points?: [number, number][];
  // Specific for image
  fileId?: string;
  scale?: [number, number];
  status?: string;
  // Specific for text
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: string;
  verticalAlign?: string;
  containerId?: string | null;
  originalText?: string;
  lineHeight?: number;
}

export interface ExcalidrawFile {
  mimeType: string;
  id: string;
  dataURL: string;
  created: number;
}

export interface ExcalidrawLibraryItem {
  id: string;
  status: 'published' | 'unpublished';
  created: number;
  name?: string;
  elements: ExcalidrawElement[];
  files?: Record<string, ExcalidrawFile>;
}

export interface ExcalidrawLibraryPackage {
  type: 'excalidrawlib';
  version: 2;
  libraryItems: ExcalidrawLibraryItem[];
  files?: Record<string, ExcalidrawFile>;
}
