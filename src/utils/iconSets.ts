import type { IconAsset, IconSet, IconSetSummary } from '../types';
import { categorizeByRules, expandSynonyms, formatTitle } from './categorizer';
import { discover, readIntrinsicSize, toDataUrl } from './iconSets/discovery';
import { resolveRules, summarise } from './iconSets/resolve';

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
 * heaviest of them. The work is in `iconSets/`:
 *
 *   discovery.ts        the virtual module, and what is read off raw markup
 *   resolve.ts          untrusted `set.json` -> validated `IconSetSummary`
 *   fallbackPresets.ts  what a set with no presets of its own gets
 */

/**
 * KNOWN GAP - three module-level caches, no invalidation. `discovered` in
 * `iconSets/discovery.ts`, `summaries` in `iconSets/resolve.ts`, and
 * `materialised` below are all populated once and never cleared. Under Vite
 * HMR the `virtual:icon-sets` module can rebuild while this module instance
 * survives, so edits to `svg/` show up in the virtual module and not on the
 * page until a full reload. Harmless in a production build, where the virtual
 * module is frozen at build time; a real papercut in dev.
 */
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
