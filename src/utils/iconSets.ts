import type {
  IconAsset,
  IconCategory,
  IconCategoryRule,
  IconSet,
  IconSetManifest,
  IconSetSummary,
} from '../types';
import { IMPLICIT_CATEGORY, categorizeByRules, expandSynonyms, formatTitle } from './categorizer';
import { optimizeSvgString } from './svgOptimizer';

/**
 * Icon sets are folders.
 *
 * `svg/<set-id>/*.svg` is a set, and `svg/<set-id>/set.json` optionally names
 * and categorises it. Nothing has to be registered anywhere: dropping a folder
 * into `svg/` makes it appear at `/icons/<set-id>` on the next dev-server tick,
 * because Vite watches these glob patterns and invalidates this module when
 * their match list changes.
 *
 * A folder with no `set.json` still works - the name is inferred from the
 * folder and every icon lands in one bucket. Requiring boilerplate before an
 * icon showed up would defeat the point of dropping the folder in.
 */
const RAW_SVGS = import.meta.glob('../../svg/*/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const MANIFESTS = import.meta.glob('../../svg/*/set.json', {
  import: 'default',
  eager: true,
}) as Record<string, IconSetManifest>;

/**
 * Loose files directly under `svg/`. Matched only so the mistake can be
 * reported: they are not a set and will not appear anywhere.
 */
const LOOSE_SVGS = import.meta.glob('../../svg/*.svg', { eager: false });

const DEFAULT_ACCENT = '#4285F4';

/** Sets without an explicit `order` sort after every set that has one. */
const UNORDERED = 1_000;

function setIdFromPath(path: string): string | null {
  const match = path.match(/\/svg\/([^/]+)\//);
  return match ? match[1] : null;
}

function fileNameFromPath(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.svg$/i, '');
}

/** Encodes an SVG for use in `src`. Quotes are escaped, everything else is not. */
function toDataUrl(svg: string): string {
  const encoded = encodeURIComponent(svg).replace(/'/g, '%27').replace(/"/g, '%22');
  return `data:image/svg+xml,${encoded}`;
}

function readIntrinsicSize(svg: string): { width: number; height: number } {
  const viewBox = svg.match(/viewBox=["']\s*[\d.+-]+\s+[\d.+-]+\s+([\d.]+)\s+([\d.]+)/i);
  if (viewBox) {
    return { width: parseFloat(viewBox[1]) || 48, height: parseFloat(viewBox[2]) || 48 };
  }

  const width = svg.match(/width=["']([\d.]+)(?:px)?["']/i);
  const height = svg.match(/height=["']([\d.]+)(?:px)?["']/i);
  if (width && height) {
    return { width: parseFloat(width[1]) || 48, height: parseFloat(height[1]) || 48 };
  }

  return { width: 48, height: 48 };
}

interface Discovered {
  id: string;
  manifest: IconSetManifest;
  hasManifest: boolean;
  /** Raw file contents keyed by filename without extension, name-sorted. */
  files: Array<{ name: string; rawSvg: string }>;
}

let discovered: Map<string, Discovered> | null = null;

function discover(): Map<string, Discovered> {
  if (discovered) return discovered;

  const sets = new Map<string, Discovered>();

  const ensure = (id: string): Discovered => {
    let entry = sets.get(id);
    if (!entry) {
      entry = { id, manifest: {}, hasManifest: false, files: [] };
      sets.set(id, entry);
    }
    return entry;
  };

  for (const [path, manifest] of Object.entries(MANIFESTS)) {
    const id = setIdFromPath(path);
    if (!id) continue;
    const entry = ensure(id);
    entry.manifest = manifest ?? {};
    entry.hasManifest = true;
  }

  for (const [path, rawSvg] of Object.entries(RAW_SVGS)) {
    const id = setIdFromPath(path);
    if (!id || !rawSvg) continue;
    ensure(id).files.push({ name: fileNameFromPath(path), rawSvg });
  }

  for (const entry of sets.values()) {
    entry.files.sort((a, b) => a.name.localeCompare(b.name));
  }

  // A folder holding only a set.json is a half-finished drop, not a set.
  for (const [id, entry] of sets) {
    if (entry.files.length === 0) sets.delete(id);
  }

  const loose = Object.keys(LOOSE_SVGS).length;
  if (loose > 0 && import.meta.env.DEV) {
    console.warn(
      `[iconSets] ${loose} SVG file(s) sit directly in svg/ and will not appear on the site. ` +
        `Icons must live in a set folder, e.g. svg/my-set/icon.svg`
    );
  }

  discovered = sets;
  return sets;
}

function resolveCategories(manifest: IconSetManifest): IconCategory[] {
  const declared = manifest.categories?.filter(c => c?.id && c?.name) ?? [];
  return declared.length > 0 ? declared : [IMPLICIT_CATEGORY];
}

function resolveRules(manifest: IconSetManifest): IconCategoryRule[] {
  return manifest.rules?.filter(r => r?.category && r.match?.length) ?? [];
}

/**
 * Summaries are cached because `previews` percent-encodes up to eight files
 * per set, and callers treat this as a cheap getter they can call in render.
 */
const summaries = new Map<string, IconSetSummary>();

function summarise(entry: Discovered): IconSetSummary {
  const cached = summaries.get(entry.id);
  if (cached) return cached;

  const { manifest } = entry;

  const summary: IconSetSummary = {
    id: entry.id,
    name: manifest.name?.trim() || formatTitle(entry.id),
    description: manifest.description,
    source: manifest.source,
    sourceUrl: manifest.sourceUrl,
    license: manifest.license,
    accent: manifest.accent || DEFAULT_ACCENT,
    order: typeof manifest.order === 'number' ? manifest.order : UNORDERED,
    count: entry.files.length,
    categories: resolveCategories(manifest),
    hasManifest: entry.hasManifest,
    // Deliberately the *unoptimised* source: the gallery shows these at 28px
    // in an <img>, so running SVGO over every set on the landing page would
    // buy nothing and cost seconds.
    previews: entry.files.slice(0, 8).map(f => toDataUrl(f.rawSvg)),
  };

  summaries.set(entry.id, summary);
  return summary;
}

function byOrderThenName(a: IconSetSummary, b: IconSetSummary): number {
  return a.order - b.order || a.name.localeCompare(b.name);
}

/** Every discovered set, cheap: no SVG is optimised. */
export function listIconSets(): IconSetSummary[] {
  return Array.from(discover().values()).map(summarise).sort(byOrderThenName);
}

export function findIconSetSummary(setId: string): IconSetSummary | null {
  const entry = discover().get(setId);
  return entry ? summarise(entry) : null;
}

export function iconSetExists(setId: string): boolean {
  return discover().has(setId);
}

/**
 * Fully materialised sets, memoised.
 *
 * This is where SVGO runs, so it is deliberately per-set and on demand: the
 * gallery must not pay to optimise every icon of every set just to draw a
 * thumbnail strip.
 */
const materialised = new Map<string, IconSet>();

export function loadIconSet(setId: string): IconSet | null {
  const cached = materialised.get(setId);
  if (cached) return cached;

  const entry = discover().get(setId);
  if (!entry) return null;

  const summary = summarise(entry);
  const { manifest } = entry;
  const rules = resolveRules(manifest);
  const overrides = manifest.overrides ?? {};

  const icons: IconAsset[] = entry.files.map(({ name, rawSvg }) => {
    const override = overrides[name] ?? {};
    const title = override.title?.trim() || formatTitle(name);
    const category = override.category || categorizeByRules(name, rules, summary.categories);
    const optimizedSvg = optimizeSvgString(rawSvg);
    const { width, height } = readIntrinsicSize(optimizedSvg);

    const tags = Array.from(
      new Set(
        [
          ...name.toLowerCase().split(/[-_\s]+/),
          ...title.toLowerCase().split(/\s+/),
          ...expandSynonyms([name, title], manifest.synonyms),
          ...(manifest.tags ?? []),
          ...(override.tags ?? []),
          category,
        ]
          .map(tag => tag.trim())
          .filter(tag => tag.length > 1)
      )
    );

    return {
      id: `${setId}/${name}`,
      setId,
      name,
      title,
      category,
      tags,
      rawSvg: optimizedSvg,
      optimizedSvg,
      dataUrl: toDataUrl(optimizedSvg),
      width,
      height,
    };
  });

  icons.sort((a, b) => a.title.localeCompare(b.title));

  const set: IconSet = { ...summary, icons };
  materialised.set(setId, set);
  return set;
}

/** Total icons across every set, for the gallery header. */
export function totalIconCount(): number {
  let total = 0;
  for (const entry of discover().values()) total += entry.files.length;
  return total;
}
