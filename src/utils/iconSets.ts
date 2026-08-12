import type {
  IconAsset,
  IconCategory,
  IconCategoryRule,
  IconSet,
  IconSetManifest,
  IconSetSummary,
  ResolvedPreset,
} from '../types/icons';
import { type ExcalidrawOptions, GCP_BLUE } from '../types/options';
import { DEFAULT_EXCALIDRAW_OPTIONS, normaliseOptions } from './defaultOptions';
import { sanitizeOptionsPatch } from './optionsSchema';
import { IMPLICIT_CATEGORY, categorizeByRules, expandSynonyms, formatTitle } from './categorizer';
import { type Discovered, discover, readIntrinsicSize } from './iconSets/discovery';
import { toDataUrl } from './svgMarkup';

/**
 * Icon sets are folders.
 *
 * `svg/<set-id>/*.svg` is a set, and `svg/<set-id>/set.json` optionally names
 * and categorises it. Nothing is registered anywhere: `vite/icon-sets.ts`
 * reads the directory, optimises every file at build time and serves the
 * result as `virtual:icon-sets`. The markup arriving here is already
 * optimised.
 *
 *   discovery   what the virtual module provides, and what is read off markup
 *   presets     what a set with no presets of its own gets
 *   resolve     untrusted `set.json` -> validated `IconSetSummary`
 *   materialise the four getters the UI calls, and the memo behind them
 */

// ---------------------------------------------------------------------------
// Fallback presets
// ---------------------------------------------------------------------------

/**
 * Presets a set gets when it declares none.
 *
 * Expressed as patches over that set's own defaults, so a bare folder still
 * offers something useful without inheriting another set's colours.
 */
const FALLBACK_PRESETS: {
  id: string;
  label: string;
  hint: string;
  options: Partial<ExcalidrawOptions>;
}[] = [
  {
    id: 'sketch',
    label: 'Sketch',
    hint: 'Hand-drawn frame',
    options: {
      showCard: true,
      cardCorners: 'square',
      cardStrokeWidth: 1,
      cardFillStyle: 'hachure',
      // Hachure is stroked in the background colour, so this needs one - the
      // preset used to pair it with `transparent` and had never drawn a hatch.
      // A tint rather than the accent itself: at full saturation the hatch
      // swamps both the artwork and the label.
      cardBgColor: '#e8f0fe',
      cardStrokeColor: GCP_BLUE,
      cardRoughness: 2,
      iconRoughness: 1,
      padding: 12,
    },
  },
  {
    id: 'dark-card',
    label: 'Dark card',
    hint: 'Soft dark panel',
    options: {
      showCard: true,
      cardCorners: 'rounded',
      cardStrokeWidth: 1,
      cardFillStyle: 'solid',
      cardBgColor: 'rgba(30, 41, 59, 0.8)',
      cardStrokeColor: GCP_BLUE,
      cardRoughness: 0,
      labelColor: '#f8fafc',
      padding: 12,
    },
  },
  {
    id: 'light-card',
    label: 'Light card',
    hint: 'Clean white panel',
    options: {
      showCard: true,
      cardCorners: 'rounded',
      cardStrokeWidth: 1,
      cardFillStyle: 'solid',
      cardBgColor: '#ffffff',
      cardStrokeColor: '#cbd5e1',
      cardRoughness: 0,
      labelColor: '#0f172a',
      padding: 12,
    },
  },
  {
    id: 'outline',
    label: 'Outline',
    hint: 'Unfilled frame, keeps the canvas showing through',
    options: {
      showCard: true,
      cardCorners: 'square',
      cardStrokeWidth: 2,
      cardFillStyle: 'solid',
      cardBgColor: 'transparent',
      cardStrokeColor: GCP_BLUE,
      cardRoughness: 0,
      padding: 12,
    },
  },
];

/**
 * Owns the turn from an untrusted `set.json` into a fully resolved, validated
 * `IconSetSummary`.
 *
 * Separate because every function here is defensive in the same way: the
 * manifest is hand-authored and not typechecked, so each field is filtered,
 * defaulted, or run through `sanitizeOptionsPatch` before anything downstream
 * is allowed to see it.
 */

// ---------------------------------------------------------------------------
// Resolving a manifest
// ---------------------------------------------------------------------------

/** Sets without an explicit `order` sort after every set that has one. */
const UNORDERED = 1_000;

function resolveCategories(manifest: IconSetManifest): IconCategory[] {
  const declared = manifest.categories?.filter(c => c?.id && c?.name) ?? [];
  return declared.length > 0 ? declared : [IMPLICIT_CATEGORY];
}

function resolveRules(manifest: IconSetManifest): IconCategoryRule[] {
  return manifest.rules?.filter(r => r?.category && r.match?.length) ?? [];
}

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
    accent: manifest.accent || GCP_BLUE,
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
 *
 * This file is the public surface - four getters and the memo that backs the
 * heaviest of them. The work is in `iconSets/`.
 */

/**
 * Populated once and never invalidated, as are `discovered` in `discovery.ts`
 * and `summaries` in `resolve.ts`. Safe because nothing can change under them
 * without the module being torn down: the virtual module is frozen at build
 * time, and in dev the plugin answers any edit under `svg/` with a
 * `full-reload`.
 */
// ---------------------------------------------------------------------------
// The public getters
// ---------------------------------------------------------------------------

const materialised = new Map<string, IconSet>();

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
