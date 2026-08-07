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
  categories: IconCategory[];
  /** Whether `set.json` was present, or everything was inferred. */
  hasManifest: boolean;
  /** Cheap unoptimised data URLs for the gallery card, source order. */
  previews: string[];
}

export interface IconSet extends IconSetSummary {
  icons: IconAsset[];
}

export type CardStyle = 'none' | 'soft-card' | 'sketch-box' | 'outline' | 'badge';
export type LabelPosition = 'bottom' | 'right' | 'top' | 'inside';
export type LabelFontFamily = 1 | 2 | 3 | 4 | 5; // 1: Excalifont, 2: Helvetica, 3: Comic Shanns, 4: Lilita One, 5: Nunito

export interface ExcalidrawOptions {
  showCard: boolean;
  cardStyle: CardStyle;
  roughness: number; // 0, 1, 2
  cardBgColor: string; // hex or css color
  cardStrokeColor: string;
  showLabel: boolean;
  labelPosition: LabelPosition;
  labelFontFamily: LabelFontFamily;
  labelFontSize: number;
  labelColor: string;
  iconScale: number; // multiplier on ICON_BASE_SIZE: 1.0 = 96px, 2.0 = 192px
  padding: number; // card inner padding
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
  baseline?: number;
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
