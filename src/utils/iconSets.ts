import type {
  ExcalidrawOptions,
  IconAsset,
  IconCategory,
  IconCategoryRule,
  IconSet,
  IconSetManifest,
  IconSetSummary,
  ResolvedPreset,
} from '../types';
import { DEFAULT_EXCALIDRAW_OPTIONS, normaliseOptions } from './defaultOptions';
import { sanitizeOptionsPatch } from './optionsSchema';
import { IMPLICIT_CATEGORY, categorizeByRules, expandSynonyms, formatTitle } from './categorizer';
// eslint-disable-next-line import/no-unresolved -- supplied by vite/icon-sets.ts
import { ICON_SETS } from 'virtual:icon-sets';

/**
 * Icon sets are folders.
 *
 * `svg/<set-id>/*.svg` is a set, and `svg/<set-id>/set.json` optionally names
 * and categorises it. Nothing has to be registered anywhere: dropping a folder
 * into `svg/` makes it appear at `/icons/<set-id>` on the next dev-server tick,
 * because `vite/icon-sets.ts` watches the folder and rebuilds this module when
 * anything in it changes.
 *
 * A folder with no `set.json` still works - the name is inferred from the
 * folder and every icon lands in one bucket. Requiring boilerplate before an
 * icon showed up would defeat the point of dropping the folder in.
 *
 * The SVG markup arriving here is **already optimised**. That runs in Node at
 * build time; see `vite/icon-sets.ts` for why.
 */

/**
 * Loose files directly under `svg/`. Matched only so the mistake can be
 * reported: they are not a set and will not appear anywhere.
 */
const LOOSE_SVGS = import.meta.glob('../../svg/*.svg', { eager: false });

const DEFAULT_ACCENT = '#4285F4';

/** Sets without an explicit `order` sort after every set that has one. */
const UNORDERED = 1_000;

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
  /** Already-optimised markup, name-sorted. */
  files: Array<{ name: string; svg: string }>;
}

let discovered: Map<string, Discovered> | null = null;

function discover(): Map<string, Discovered> {
  if (discovered) return discovered;

  const sets = new Map<string, Discovered>(
    ICON_SETS.map(set => [
      set.id,
      {
        id: set.id,
        manifest: (set.manifest ?? {}) as IconSetManifest,
        hasManifest: Object.keys(set.manifest ?? {}).length > 0,
        files: set.icons,
      },
    ])
  );

  const loose = Object.keys(LOOSE_SVGS).length;
  if (loose > 0 && import.meta.env?.DEV) {
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
 * Presets a set gets when it declares none.
 *
 * Expressed as patches over that set's own defaults, so a bare folder still
 * offers something useful without inheriting another set's colours.
 */
const FALLBACK_PRESETS: { id: string; label: string; hint: string; options: Partial<ExcalidrawOptions> }[] = [
  {
    id: 'sketch',
    label: 'Sketch',
    hint: 'Hand-drawn frame',
    options: { showCard: true, cardStyle: 'sketch-box', roughness: 2, cardStrokeColor: '#4285f4' },
  },
  {
    id: 'dark-card',
    label: 'Dark card',
    hint: 'Soft dark panel',
    options: {
      showCard: true,
      cardStyle: 'soft-card',
      roughness: 0,
      cardBgColor: 'rgba(30, 41, 59, 0.8)',
      cardStrokeColor: '#4285f4',
      labelColor: '#f8fafc',
    },
  },
  {
    id: 'light-card',
    label: 'Light card',
    hint: 'Clean white panel',
    options: {
      showCard: true,
      cardStyle: 'soft-card',
      roughness: 0,
      cardBgColor: '#ffffff',
      cardStrokeColor: '#cbd5e1',
      labelColor: '#0f172a',
    },
  },
];

function resolveDefaults(setId: string, manifest: IconSetManifest): ExcalidrawOptions {
  return normaliseOptions({
    ...DEFAULT_EXCALIDRAW_OPTIONS,
    ...sanitizeOptionsPatch(manifest.defaults, `${setId}/set.json defaults`),
  });
}

/**
 * Every preset the sidebar will show, fully resolved.
 *
 * A "Default" entry is always present and always equal to the set's own
 * defaults, so there is a guaranteed way back from any experiment. An author
 * who declares their own `default` preset replaces the label and hint but not
 * that guarantee.
 */
function resolvePresets(
  setId: string,
  manifest: IconSetManifest,
  defaults: ExcalidrawOptions
): ResolvedPreset[] {
  const declared = manifest.presets?.filter(p => p?.id && p?.label) ?? [];
  const source = declared.length > 0 ? declared : FALLBACK_PRESETS;

  const resolved = source
    .filter(p => p.id !== 'default')
    .map(preset => ({
      id: preset.id,
      label: preset.label,
      hint: preset.hint,
      options: normaliseOptions({
        ...defaults,
        ...sanitizeOptionsPatch(preset.options, `${setId}/set.json preset "${preset.id}"`),
      }),
    }));

  const authored = source.find(p => p.id === 'default');

  return [
    {
      id: 'default',
      label: authored?.label ?? 'Default',
      hint: authored?.hint ?? 'How this set is meant to look',
      options: defaults,
    },
    ...resolved,
  ];
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
  const defaults = resolveDefaults(entry.id, manifest);

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
    defaults,
    presets: resolvePresets(entry.id, manifest, defaults),
    categories: resolveCategories(manifest),
    hasManifest: entry.hasManifest,
    previews: entry.files.slice(0, 8).map(f => toDataUrl(f.svg)),
  };

  summaries.set(entry.id, summary);
  return summary;
}

function byOrderThenName(a: IconSetSummary, b: IconSetSummary): number {
  return a.order - b.order || a.name.localeCompare(b.name);
}

/** Every discovered set. Cheap: the markup arrives already optimised. */
export function listIconSets(): IconSetSummary[] {
  return Array.from(discover().values()).map(summarise).sort(byOrderThenName);
}

/**
 * One set's metadata without materialising its icons.
 *
 * The set page needs the declared defaults and presets on its first render,
 * before the icons themselves have been built, because they seed the persisted
 * styling state.
 */
export function findIconSetSummary(setId: string): IconSetSummary | null {
  const entry = discover().get(setId);
  return entry ? summarise(entry) : null;
}

/**
 * Fully materialised sets, memoised.
 *
 * Now only string work - titles, categories, search tags, data URLs - because
 * the optimiser already ran at build time. Still per-set and memoised so the
 * gallery does not build tag indexes for sets nobody opened.
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

  const icons: IconAsset[] = entry.files.map(({ name, svg }) => {
    const override = overrides[name] ?? {};
    const title = override.title?.trim() || formatTitle(name);
    const category = override.category || categorizeByRules(name, rules, summary.categories);
    const { width, height } = readIntrinsicSize(svg);

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
      rawSvg: svg,
      optimizedSvg: svg,
      dataUrl: toDataUrl(svg),
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
