import type {
  IconCategory,
  IconCategoryRule,
  IconSetManifest,
  IconSetSummary,
  ResolvedPreset,
} from '../../types/icons';
import { type ExcalidrawOptions, GCP_BLUE } from '../../types/options';
import { DEFAULT_EXCALIDRAW_OPTIONS, normaliseOptions } from '../defaultOptions';
import { sanitizeOptionsPatch } from '../optionsSchema';
import { IMPLICIT_CATEGORY, formatTitle } from '../categorizer';
import { FALLBACK_PRESETS } from './fallbackPresets';
import { type Discovered, toDataUrl } from './discovery';

/**
 * Owns the turn from an untrusted `set.json` into a fully resolved, validated
 * `IconSetSummary`.
 *
 * Separate because every function here is defensive in the same way: the
 * manifest is hand-authored and not typechecked, so each field is filtered,
 * defaulted, or run through `sanitizeOptionsPatch` before anything downstream
 * is allowed to see it.
 */

/** Sets without an explicit `order` sort after every set that has one. */
const UNORDERED = 1_000;

export function resolveCategories(manifest: IconSetManifest): IconCategory[] {
  const declared = manifest.categories?.filter(c => c?.id && c?.name) ?? [];
  return declared.length > 0 ? declared : [IMPLICIT_CATEGORY];
}

export function resolveRules(manifest: IconSetManifest): IconCategoryRule[] {
  return manifest.rules?.filter(r => r?.category && r.match?.length) ?? [];
}

export function resolveDefaults(setId: string, manifest: IconSetManifest): ExcalidrawOptions {
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
export function resolvePresets(
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

export function summarise(entry: Discovered): IconSetSummary {
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
