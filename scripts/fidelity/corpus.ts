/**
 * Turning a directory of SVGs into the exact shape of input the shipped code
 * receives at runtime.
 */
import fs from 'node:fs';
import path from 'node:path';

import { optimizeSvgString } from '../../src/utils/svgOptimizer';
import { IMPLICIT_CATEGORY, categorizeByRules, formatTitle } from '../../src/utils/categorizer';
import type { IconAsset, IconSetManifest } from '../../src/types/icons';

import { readViewBox } from '../lib/raster';
import { warnBadManifest } from './console';

/**
 * One SVG on disk, plus the set it belongs to.
 *
 * `id` is the baseline key, so it has to be unique and stable. A file sitting
 * directly in the input directory keeps its bare filename - that is the
 * torture corpus, and its ids are referenced by name from the methodology page
 * and the evidence manifest. A file inside a set folder is always prefixed
 * `<set>__<name>`, even when nothing currently collides.
 *
 * Prefixing unconditionally is the point: two Google Cloud icon sets will
 * share most of their filenames, and deriving the prefix from whether a
 * collision happens to exist today would silently rename a baselined icon the
 * moment a second set landed, quietly dropping it from the regression gate.
 */
export interface Candidate {
  id: string;
  name: string;
  setId: string;
  absPath: string;
}

/** `svg/<set>/set.json`, or `{}` for a bare folder / a flat input directory. */
const manifestCache = new Map<string, IconSetManifest>();

function manifestFor(dir: string): IconSetManifest {
  const cached = manifestCache.get(dir);
  if (cached) return cached;

  const file = path.join(dir, 'set.json');
  let manifest: IconSetManifest = {};
  if (fs.existsSync(file)) {
    try {
      manifest = JSON.parse(fs.readFileSync(file, 'utf-8')) as IconSetManifest;
    } catch (err: any) {
      warnBadManifest(path.relative(process.cwd(), file), err?.message);
    }
  }

  manifestCache.set(dir, manifest);
  return manifest;
}

/**
 * Every `.svg` under `root`, recursing into set folders.
 *
 * A flat input directory still works unchanged - that is the torture corpus -
 * and recursion is what lets `--input=svg` keep scoring the whole library now
 * that it is split into `svg/<set>/`.
 */
export function collectSvgFiles(root: string): Candidate[] {
  const found: Candidate[] = [];

  const walk = (dir: string, setId: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // The first level below the input root names the set; anything deeper
        // is organisation inside that set and does not extend the prefix.
        walk(abs, setId || entry.name);
        continue;
      }

      if (!entry.name.toLowerCase().endsWith('.svg')) continue;

      const name = path.basename(entry.name, '.svg');
      found.push({
        name,
        setId: setId || path.basename(root),
        absPath: abs,
        id: setId ? `${setId}__${name}` : name,
      });
    }
  };

  walk(root, '');

  const seen = new Set<string>();
  for (const file of found) {
    if (seen.has(file.id)) {
      throw new Error(
        `Duplicate baseline id "${file.id}": two files in the same set resolve to the same key.`
      );
    }
    seen.add(file.id);
  }

  return found.sort((a, b) => a.id.localeCompare(b.id));
}

/** Mirrors `iconSets.loadIconSet` so the harness feeds the shipped code the same shape of input. */
export function buildIcon(candidate: Candidate, rawSvg: string): IconAsset {
  const optimizedSvg = optimizeSvgString(rawSvg);
  const viewBox = readViewBox(optimizedSvg) ?? { x: 0, y: 0, width: 48, height: 48 };
  const manifest = manifestFor(path.dirname(candidate.absPath));
  const override = manifest.overrides?.[candidate.name] ?? {};
  const categories = manifest.categories?.length ? manifest.categories : [IMPLICIT_CATEGORY];
  const title = override.title?.trim() || formatTitle(candidate.name);
  const encoded = encodeURIComponent(optimizedSvg).replace(/'/g, '%27').replace(/"/g, '%22');

  return {
    id: candidate.id,
    setId: candidate.setId,
    name: candidate.name,
    title,
    category:
      override.category || categorizeByRules(candidate.name, manifest.rules ?? [], categories),
    tags: [],
    rawSvg: optimizedSvg,
    dataUrl: `data:image/svg+xml,${encoded}`,
    width: viewBox.width,
    height: viewBox.height,
  };
}
