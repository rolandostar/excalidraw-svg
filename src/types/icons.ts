import type { ExcalidrawOptions } from './options';

/**
 * Owns the icon-library domain: what an icon is, what a set is, and what
 * `svg/<set-id>/set.json` may declare.
 *
 * Separate because these three types travel together and nothing else needs
 * them. The gallery and the set page import from here; the converter and the
 * export path do not.
 */

export interface IconAsset {
  /** Unique across the whole site: `<setId>/<name>`. */
  id: string;
  /** Which set this came from, i.e. the folder name under `svg/`. */
  setId: string;
  name: string; // original filename without extension, e.g. "Cloud-Run"
  title: string; // clean display title, e.g. "Cloud Run"
  category: string; // a category id declared by the set, or 'general'
  tags: string[];
  /**
   * The markup the converter reads. Already optimised - that runs in Node at
   * build time, so there is no second "raw" form to keep alongside it.
   */
  rawSvg: string;
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

/** A set's identity and styling, without the icons themselves. */
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
