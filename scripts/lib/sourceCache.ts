/**
 * On-disk cache for the half of every comparison that cannot change.
 *
 * Profiling the suite showed rasterisation is 93% of its CPU time, and most of
 * that is spent on the *source* side:
 *
 *     rasterise + pixel diff   61.7%   736 ms/icon
 *     inkBox (resvg 512+scan)  31.1%   370 ms/icon
 *     everything else           7.2%
 *
 * The scene side depends on the converter and has to be redone on every run.
 * The source side does not: `inkBox(rawSvg)`, the source viewBox and the
 * rasterised source panel are functions of the input file and nothing else.
 * Recomputing them on every run was re-deriving a constant, which is exactly
 * the cost you notice when iterating on conversion code.
 *
 * The key covers the file's bytes *and* the measurement code and geometry
 * constants, so editing how a thing is measured invalidates every entry rather
 * than silently comparing against a stale reference.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Box, Raster } from './raster';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(process.cwd(), 'tests', '.cache', 'fidelity');

export interface CachedSource {
  ink: Box | null;
  viewBox: Box | null;
  raster: Raster;
}

/**
 * Invalidation tag.
 *
 * Hashes the source of both measurement modules plus the caller's geometry
 * constants. `raster.ts` decides what a render looks like and `fidelity.ts`
 * decides what a window means, so a change to either must throw the cache
 * away - a cached panel measured under different rules is not a speed-up, it
 * is a wrong answer that reproduces.
 */
export function cacheVersion(constants: unknown): string {
  const parts = ['raster.ts', 'fidelity.ts'].map(f => {
    try {
      return fs.readFileSync(path.join(HERE, f), 'utf-8');
    } catch {
      return f;
    }
  });

  return crypto
    .createHash('sha256')
    .update(parts.join('\0'))
    .update(JSON.stringify(constants))
    .digest('hex')
    .slice(0, 12);
}

function entryPath(version: string, rawSvg: string): string {
  const hash = crypto.createHash('sha256').update(rawSvg).digest('hex').slice(0, 32);
  return path.join(CACHE_DIR, `${hash}-${version}`);
}

export function readSource(version: string, rawSvg: string): CachedSource | null {
  const base = entryPath(version, rawSvg);

  try {
    const meta = JSON.parse(fs.readFileSync(`${base}.json`, 'utf-8'));
    const pixels = zlib.gunzipSync(fs.readFileSync(`${base}.bin`));

    if (pixels.length !== meta.width * meta.height * 4) return null;

    return {
      ink: meta.ink,
      viewBox: meta.viewBox,
      raster: { data: new Uint8Array(pixels), width: meta.width, height: meta.height },
    };
  } catch {
    // A missing or half-written entry is a cache miss, never a failure.
    return null;
  }
}

export function writeSource(version: string, rawSvg: string, value: CachedSource): void {
  const base = entryPath(version, rawSvg);

  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });

    // Written to a temp name and renamed, so a killed run cannot leave a
    // truncated entry that a later run would read as valid.
    const tmp = `${base}.${process.pid}.tmp`;
    fs.writeFileSync(
      `${tmp}.json`,
      JSON.stringify({
        ink: value.ink,
        viewBox: value.viewBox,
        width: value.raster.width,
        height: value.raster.height,
      })
    );
    fs.writeFileSync(`${tmp}.bin`, zlib.gzipSync(Buffer.from(value.raster.data), { level: 1 }));
    fs.renameSync(`${tmp}.json`, `${base}.json`);
    fs.renameSync(`${tmp}.bin`, `${base}.bin`);
  } catch {
    // A cache that cannot be written must not break the run.
  }
}

/** Removes entries from older versions; keeps the directory from growing forever. */
export function pruneCache(version: string): number {
  let removed = 0;
  try {
    for (const file of fs.readdirSync(CACHE_DIR)) {
      if (file.includes(`-${version}.`)) continue;
      fs.rmSync(path.join(CACHE_DIR, file), { force: true });
      removed++;
    }
  } catch {
    /* no cache dir yet */
  }
  return removed;
}
