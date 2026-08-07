/**
 * Conversion fidelity harness.
 *
 * This suite does NOT ask "did we emit at least one element" - the previous
 * version did, which is why it reported 216/216 successful while several icons
 * were visibly wrong. Every icon is now scored objectively:
 *
 *   1. the icon is converted through the *shipped* export path
 *      (`createExcalidrawItem` / `buildExcalidrawLibraryPackage` /
 *      `buildExcalidrawClipboardData`) using `DEFAULT_EXCALIDRAW_OPTIONS`;
 *   2. the resulting scene is rendered by *Excalidraw's own* `exportToSvg`,
 *      not a Rough.js re-implementation;
 *   3. that render is pixel-diffed against the original SVG (shape error) and
 *      its geometry is compared numerically against where the source ink
 *      should have landed (placement error);
 *   4. `auditSceneFidelity` catches structural faults Excalidraw would
 *      silently swallow (unfilled open paths, degenerate shapes, image
 *      elements whose file was dropped).
 *
 * Usage:
 *
 *   tsx scripts/run-fidelity.ts --input=<dir> [--name=<suite>]
 *                               [--update-baseline] [--only=<substring>]
 *
 * Any directory of SVGs works. Results land in `tests/results/<suite>/` and
 * are gated against `tests/baselines/<suite>.json`; `--update-baseline`
 * accepts the current numbers as the new reference.
 */
import './setupDom';

import { fork } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import { DEFAULT_EXCALIDRAW_OPTIONS } from '../src/utils/defaultOptions';
import { optimizeSvgString } from '../src/utils/svgOptimizer';
import {
  parseSvgToExcalidrawElements,
  createExcalidrawItem,
  buildExcalidrawLibraryPackage,
  buildExcalidrawClipboardData,
} from '../src/utils/excalidrawGenerator';
import { IMPLICIT_CATEGORY, categorizeByRules, formatTitle } from '../src/utils/categorizer';
import { collectUnsupportedFeatures, describeWarnings } from '../src/utils/svgSupport';
import { IconAsset, IconSetManifest } from '../src/types';

import { renderExcalidrawSceneInWindow, auditSceneFidelity } from './excalidrawRenderer';
import { Box, inkBox, readViewBox } from './lib/raster';
import {
  compareInFrame,
  comparePlacement,
  expectedBounds,
  sceneWindowToSourceWindow,
  unionBounds,
} from './lib/fidelity';
import { stabiliseElements, stabiliseFiles } from './lib/snapshot';
import {
  DEFAULT_THRESHOLDS,
  IconMetrics,
  Summary,
  buildHtmlReport,
  composeTriptych,
} from './lib/report';

function flag(name: string): string | null {
  const found = process.argv.find(a => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : null;
}

const INPUT_DIR = path.resolve(process.cwd(), flag('input') ?? 'svg');

/**
 * Suite name, defaulting to the input folder's own name. It selects both the
 * results folder and the baseline file, so two corpora never collide.
 */
const SUITE = flag('name') ?? path.basename(INPUT_DIR).replace(/-svg$/, '');

const RESULTS_DIR = path.resolve(process.cwd(), 'tests/results', SUITE);
const ELEMENTS_DIR = path.join(RESULTS_DIR, 'elements');
const COMPARISONS_DIR = path.join(RESULTS_DIR, 'comparisons');
const BASELINE_FILE = path.resolve(process.cwd(), 'tests/baselines', `${SUITE}.json`);

const PANEL_SIZE = 320;
const TARGET = { x: 0, y: 0, width: 48, height: 48 };

/**
 * Slack around the target box so a stroke sitting on the artwork's edge - and
 * the round cap Excalidraw adds to it - stays inside the comparison window.
 */
const FRAME_MARGIN = 6;
const SCENE_WINDOW: Box = {
  x: TARGET.x - FRAME_MARGIN,
  y: TARGET.y - FRAME_MARGIN,
  width: TARGET.width + FRAME_MARGIN * 2,
  height: TARGET.height + FRAME_MARGIN * 2,
};

const updateBaseline = process.argv.includes('--update-baseline');
const onlyFilter = (() => {
  const flag = process.argv.find(a => a.startsWith('--only='));
  return flag ? flag.slice('--only='.length).toLowerCase() : null;
})();

/**
 * Triptych policy.
 *
 * `scored` writes a comparison image only when the diff is non-empty. On the
 * icon corpus 258 of 261 files are pixel-identical, so the default wrote 261
 * 960x320 PNGs to publish six. `all` is required by any suite whose every case
 * is published - the torture gallery shows all of them, passing included.
 */
const COMPARISON_MODE = (flag('comparisons') ?? 'scored') as 'all' | 'scored';
if (!['all', 'scored'].includes(COMPARISON_MODE)) {
  throw new Error(`--comparisons must be "all" or "scored", got "${COMPARISON_MODE}"`);
}

/**
 * Per-file `.excalidraw` dumps. Nothing reads them - `tests/results/` is
 * gitignored, so they cannot be a regression reference - they are a debugging
 * aid for inspecting one conversion by hand. Off by default; 261 pretty-printed
 * element payloads is a lot of I/O for output nobody opened.
 */
const WRITE_SNAPSHOTS = process.argv.includes('--snapshots');

/**
 * Worker fan-out. Each file is scored independently, so the only shared state
 * is the output directory, and every file owns a unique filename in it.
 */
const MAX_JOBS = 8;
const JOBS = (() => {
  const requested = Number(flag('jobs') ?? 0);
  if (Number.isFinite(requested) && requested > 0) return Math.floor(requested);
  return Math.max(1, Math.min(MAX_JOBS, os.cpus().length - 1));
})();

/** Set on forked children; the value is the path they write their result to. */
const WORKER_OUT = flag('worker-out');

function ensureDirs() {
  const dirs = [RESULTS_DIR, COMPARISONS_DIR, path.dirname(BASELINE_FILE)];
  if (WRITE_SNAPSHOTS) dirs.push(ELEMENTS_DIR);
  for (const dir of dirs) fs.mkdirSync(dir, { recursive: true });
}

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
interface Candidate {
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
      console.warn(`  ! ${path.relative(process.cwd(), file)} is not valid JSON: ${err?.message}`);
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
function collectSvgFiles(root: string): Candidate[] {
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
function buildIcon(candidate: Candidate, rawSvg: string): IconAsset {
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
    optimizedSvg,
    dataUrl: `data:image/svg+xml,${encoded}`,
    width: viewBox.width,
    height: viewBox.height,
  };
}

function describeIssues(prefix: string, issues: ReturnType<typeof auditSceneFidelity>): string[] {
  return issues.map(i => `${prefix}: [${i.kind}] element #${i.elementIndex} (${i.elementType}) - ${i.detail}`);
}

/** What one worker hands back for one file. */
interface ScoredFile {
  record: IconMetrics;
  icon: IconAsset | null;
  /** True when a triptych was actually written, for the run summary. */
  wroteComparison: boolean;
}

/**
 * Scores a single SVG.
 *
 * Pure with respect to other files - it reads one path and writes only to
 * filenames derived from that file's id - which is what makes the fan-out
 * below safe.
 */
async function scoreFile(candidate: Candidate): Promise<ScoredFile> {
  const name = candidate.id;
  const rawSvg = fs.readFileSync(candidate.absPath, 'utf-8');
  let wroteComparison = false;

  const record: IconMetrics = {
    id: name,
    title: formatTitle(candidate.name),
    category: '',
    elementCount: 0,
    shapeScore: null,
    placementErrorPx: null,
    auditIssues: [],
    rawBytes: rawSvg.length,
    optimizedBytes: 0,
  };

  let icon: IconAsset | null = null;

  {
    try {
      icon = buildIcon(candidate, rawSvg);
      record.category = icon.category;
      record.title = icon.title;
      record.optimizedBytes = icon.optimizedSvg.length;

      // Reported, never fatal: an approximation is a documented trade-off and
      // an unsupported feature is information the user needs, not a crash.
      const features = collectUnsupportedFeatures(rawSvg);
      if (features.length > 0) record.featureWarnings = describeWarnings(features);

      // --- geometry under test -------------------------------------------
      const elements = parseSvgToExcalidrawElements(
        icon.rawSvg,
        TARGET.x,
        TARGET.y,
        TARGET.width,
        TARGET.height,
        `group_${name.replace(/[^a-zA-Z0-9]/g, '_')}`,
        DEFAULT_EXCALIDRAW_OPTIONS.roughness
      );
      record.elementCount = elements.length;

      // --- structural audit of every shipped export path ------------------
      record.auditIssues.push(...describeIssues('vector', auditSceneFidelity(elements)));

      const asItem = createExcalidrawItem(icon, DEFAULT_EXCALIDRAW_OPTIONS, 0, 0);
      record.auditIssues.push(...describeIssues('clipboard', auditSceneFidelity(asItem.elements, asItem.files)));

      // A library item is serialised without its `files` map, so any image
      // element it carries is already broken at this point.
      record.auditIssues.push(...describeIssues('library', auditSceneFidelity(asItem.elements, {})));

      // --- fidelity scoring ------------------------------------------------
      const sourceInk = inkBox(rawSvg);
      const sourceViewBox = readViewBox(rawSvg);

      if (elements.length > 0 && sourceViewBox) {
        const scene = await renderExcalidrawSceneInWindow(elements as any, SCENE_WINDOW, {});
        const sourceWindow = sceneWindowToSourceWindow(SCENE_WINDOW, sourceViewBox, TARGET);
        const shape = compareInFrame(rawSvg, sourceWindow, scene.svg, {
          x: 0,
          y: 0,
          width: SCENE_WINDOW.width,
          height: SCENE_WINDOW.height,
        }, PANEL_SIZE);

        if (shape) {
          record.shapeScore = shape.score;

          // A pixel-identical pair produces a blank diff panel that nothing
          // publishes and nobody opens. Encoding and writing it for every
          // passing file was the single largest source of I/O in the run.
          if (COMPARISON_MODE === 'all' || shape.mismatchedPixels > 0) {
            fs.writeFileSync(
              path.join(COMPARISONS_DIR, `${name}.png`),
              composeTriptych([shape.source, shape.scene, shape.diff])
            );
            wroteComparison = true;
          }
        }
      } else {
        record.shapeScore = 1;
        record.auditIssues.push('vector: conversion produced zero elements');
      }

      if (sourceInk && sourceViewBox) {
        const placement = comparePlacement(
          expectedBounds(sourceInk, sourceViewBox, TARGET),
          unionBounds(elements)
        );
        record.placementErrorPx = placement ? placement.maxErrorPx : null;
      }

      // --- deterministic snapshot -----------------------------------------
      if (WRITE_SNAPSHOTS) {
        fs.writeFileSync(
          path.join(ELEMENTS_DIR, `${name}.excalidraw`),
          JSON.stringify(
            {
              type: 'excalidraw',
              version: 2,
              source: 'excalidraw-gcp-test-suite',
              elements: stabiliseElements(elements, name),
              appState: { gridSize: null, viewBackgroundColor: '#ffffff' },
              files: {},
            },
            null,
            2
          ),
          'utf-8'
        );
      }
    } catch (err: any) {
      record.error = err?.message || String(err);
      record.shapeScore = 1;
    }
  }

  return { record, icon, wroteComparison };
}

/** Round-robin, so a slow run of large files cannot land entirely on one worker. */
function shard<T>(items: T[], buckets: number): T[][] {
  const out: T[][] = Array.from({ length: buckets }, () => []);
  items.forEach((item, i) => out[i % buckets].push(item));
  return out;
}

/** Child entry point: score a slice, write it to a file, exit. */
async function runWorker(outFile: string) {
  const candidates: Candidate[] = JSON.parse(fs.readFileSync(`${outFile}.in`, 'utf-8'));
  const results: ScoredFile[] = [];

  for (const candidate of candidates) {
    results.push(await scoreFile(candidate));
    if (process.send) process.send({ done: 1 });
  }

  fs.writeFileSync(outFile, JSON.stringify(results), 'utf-8');
}

/**
 * Scores every file, fanned out across `JOBS` child processes.
 *
 * Forking rather than threading because the scoring stack is a jsdom document
 * plus Excalidraw's renderer reading bare globals, and giving each of those a
 * private realm is the whole reason this is safe to parallelise at all.
 */
async function scoreAll(files: Candidate[]): Promise<ScoredFile[]> {
  if (JOBS <= 1 || files.length < JOBS * 2) {
    const out: ScoredFile[] = [];
    for (let i = 0; i < files.length; i++) {
      out.push(await scoreFile(files[i]));
      if ((i + 1) % 25 === 0 || i + 1 === files.length) console.log(`  ${i + 1}/${files.length}`);
    }
    return out;
  }

  const shards = shard(files, JOBS).filter(s => s.length > 0);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fidelity-'));
  const self = fileURLToPath(import.meta.url);

  let completed = 0;
  const tick = () => {
    completed++;
    if (completed % 25 === 0 || completed === files.length) {
      console.log(`  ${completed}/${files.length}`);
    }
  };

  const runs = shards.map(
    (slice, i) =>
      new Promise<ScoredFile[]>((resolve, reject) => {
        const outFile = path.join(tmpDir, `shard-${i}.json`);
        fs.writeFileSync(`${outFile}.in`, JSON.stringify(slice), 'utf-8');

        // Every flag the child needs to reproduce this run's output policy.
        const args = [
          `--worker-out=${outFile}`,
          `--input=${INPUT_DIR}`,
          `--name=${SUITE}`,
          `--comparisons=${COMPARISON_MODE}`,
          ...(WRITE_SNAPSHOTS ? ['--snapshots'] : []),
        ];

        const child = fork(self, args, { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
        child.on('message', (m: any) => m?.done && tick());
        child.on('error', reject);
        child.on('exit', code => {
          if (code !== 0) return reject(new Error(`worker ${i} exited with code ${code}`));
          try {
            resolve(JSON.parse(fs.readFileSync(outFile, 'utf-8')));
          } catch (err) {
            reject(err);
          }
        });
      })
  );

  let settled: ScoredFile[][];
  try {
    settled = await Promise.all(runs);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // Re-sorted by id so the report, the summary and the console are ordered
  // identically no matter how the shards happened to finish.
  return settled.flat().sort((a, b) => a.record.id.localeCompare(b.record.id));
}

async function run() {
  ensureDirs();

  // A worker is handed its slice explicitly and must not re-walk the corpus.
  if (WORKER_OUT) {
    await runWorker(WORKER_OUT);
    return;
  }

  let files = collectSvgFiles(INPUT_DIR);
  if (onlyFilter) files = files.filter(f => f.id.toLowerCase().includes(onlyFilter));

  const setIds = [...new Set(files.map(f => f.setId))];
  const jobs = JOBS <= 1 || files.length < JOBS * 2 ? 1 : Math.min(JOBS, files.length);
  console.log(
    `Suite "${SUITE}": scoring ${files.length} SVG(s) from ${path.relative(process.cwd(), INPUT_DIR)}` +
      (setIds.length > 1 ? ` across ${setIds.length} sets (${setIds.join(', ')})` : '') +
      (jobs > 1 ? ` on ${jobs} workers` : '')
  );

  const baseline: Record<string, number> | null = fs.existsSync(BASELINE_FILE)
    ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8'))
    : null;

  const startedAt = Date.now();
  const scored = await scoreAll(files);

  const metrics: IconMetrics[] = scored.map(s => s.record);
  const icons: IconAsset[] = scored.map(s => s.icon).filter((i): i is IconAsset => i !== null);
  const comparisonsWritten = scored.filter(s => s.wroteComparison).length;

  // --- whole-package checks ------------------------------------------------
  const packageIssues: string[] = [];

  const library = buildExcalidrawLibraryPackage(icons, DEFAULT_EXCALIDRAW_OPTIONS);
  library.libraryItems.forEach(item => {
    auditSceneFidelity(item.elements, item.files ?? {}).forEach(issue => {
      packageIssues.push(`library item "${item.name}": [${issue.kind}] ${issue.detail}`);
    });
  });

  const clipboard = buildExcalidrawClipboardData(icons, DEFAULT_EXCALIDRAW_OPTIONS);
  const clipboardPayload = JSON.parse(clipboard.jsonText);
  auditSceneFidelity(clipboardPayload.elements, clipboardPayload.files).forEach(issue => {
    packageIssues.push(`clipboard: [${issue.kind}] element #${issue.elementIndex} - ${issue.detail}`);
  });

  fs.writeFileSync(
    path.join(RESULTS_DIR, 'library.excalidrawlib'),
    JSON.stringify(
      {
        type: 'excalidrawlib',
        version: 2,
        source: 'https://excalidraw-gcp.studio',
        libraryItems: library.libraryItems.map(item => ({
          ...item,
          id: item.name ?? item.id,
          created: 0,
          elements: stabiliseElements(item.elements, item.name ?? item.id),
          ...(item.files ? { files: stabiliseFiles(item.files, item.elements, item.name ?? item.id) } : {}),
        })),
      },
      null,
      2
    ),
    'utf-8'
  );

  // --- summary -------------------------------------------------------------
  const shapeScores = metrics.filter(m => m.shapeScore !== null).map(m => m.shapeScore as number);
  const placements = metrics.filter(m => m.placementErrorPx !== null).map(m => m.placementErrorPx as number);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  const failing = metrics.filter(
    m =>
      m.error ||
      m.auditIssues.length > 0 ||
      (m.shapeScore ?? 1) > DEFAULT_THRESHOLDS.shapeScore ||
      (m.placementErrorPx ?? 99) > DEFAULT_THRESHOLDS.placementErrorPx
  );

  const summary: Summary = {
    generatedAt: new Date().toISOString(),
    totalProcessed: metrics.length,
    meanShapeScore: mean(shapeScores),
    worstShapeScore: shapeScores.length ? Math.max(...shapeScores) : 0,
    meanPlacementErrorPx: mean(placements),
    worstPlacementErrorPx: placements.length ? Math.max(...placements) : 0,
    failingIcons: failing.length,
    auditIssueCount: metrics.reduce((n, m) => n + m.auditIssues.length, 0) + packageIssues.length,
    thresholds: DEFAULT_THRESHOLDS,
    icons: metrics,
  };

  fs.writeFileSync(path.join(RESULTS_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
  fs.writeFileSync(path.join(RESULTS_DIR, 'comparison.html'), buildHtmlReport(summary, baseline), 'utf-8');

  // --- baseline gate -------------------------------------------------------
  const currentScores: Record<string, number> = {};
  metrics.forEach(m => {
    if (m.shapeScore !== null) currentScores[m.id] = Number(m.shapeScore.toFixed(6));
  });

  const regressions: string[] = [];
  /**
   * Ids the baseline has never seen.
   *
   * These are NOT gated - there is nothing to compare against - so they have
   * to be reported. Adding a set otherwise buys it silent exemption from the
   * regression suite, which is the failure mode this whole harness exists to
   * prevent.
   */
  const unbaselined: string[] = [];

  if (baseline && !updateBaseline && !onlyFilter) {
    for (const [id, score] of Object.entries(currentScores)) {
      const before = baseline[id];
      if (before === undefined) {
        unbaselined.push(id);
        continue;
      }
      if (score > before + DEFAULT_THRESHOLDS.regressionSlack) {
        regressions.push(`${id}: ${(before * 100).toFixed(2)}% -> ${(score * 100).toFixed(2)}%`);
      }
    }
  }

  // A `--only` run sees a subset of icons, so it must never be allowed to
  // overwrite the full-corpus reference.
  if (onlyFilter) {
    console.log('\n--only run: baseline neither read nor written.');
  } else if (updateBaseline || !baseline) {
    fs.writeFileSync(BASELINE_FILE, JSON.stringify(currentScores, null, 2), 'utf-8');
    console.log(`\nBaseline ${baseline ? 'updated' : 'created'}: ${BASELINE_FILE}`);
  }

  // --- console -------------------------------------------------------------
  const worst = [...metrics].sort((a, b) => (b.shapeScore ?? 0) - (a.shapeScore ?? 0)).slice(0, 15);

  console.log(`\nCompleted in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  console.log(`  mean shape error     ${(summary.meanShapeScore * 100).toFixed(3)}%`);
  console.log(`  worst shape error    ${(summary.worstShapeScore * 100).toFixed(2)}%`);
  console.log(`  mean placement error ${summary.meanPlacementErrorPx.toFixed(3)}px`);
  console.log(`  worst placement err  ${summary.worstPlacementErrorPx.toFixed(3)}px`);
  console.log(`  audit issues         ${summary.auditIssueCount}`);
  console.log(`  failing files        ${summary.failingIcons}/${summary.totalProcessed}`);
  console.log(
    `  triptychs written    ${comparisonsWritten}/${metrics.length}` +
      (COMPARISON_MODE === 'scored'
        ? `  (identical pairs skipped; --comparisons=all to force)`
        : '')
  );

  const flagged = metrics.filter(m => m.featureWarnings);
  if (flagged.length) {
    console.log(`
Unsupported/approximated features (${flagged.length} file(s)):`);
    flagged.forEach(m => console.log(`  ${m.id}: ${m.featureWarnings}`));
  }

  console.log('\nWorst 15 by shape error:');
  worst.forEach(m => {
    console.log(
      `  ${((m.shapeScore ?? 0) * 100).toFixed(2).padStart(6)}%  ${m.id}${
        m.auditIssues.length ? `  (${m.auditIssues.length} audit issue(s))` : ''
      }`
    );
  });

  if (packageIssues.length) {
    console.log(`\nPackage-level issues (${packageIssues.length}):`);
    [...new Set(packageIssues)].slice(0, 20).forEach(i => console.log(`  ${i}`));
  }

  if (unbaselined.length) {
    const bySet = new Map<string, number>();
    unbaselined.forEach(id => {
      const set = id.includes('__') ? id.slice(0, id.indexOf('__')) : '(root)';
      bySet.set(set, (bySet.get(set) ?? 0) + 1);
    });

    console.log(`\nNOT GATED - ${unbaselined.length} file(s) have no baseline entry:`);
    [...bySet].forEach(([set, n]) => console.log(`  ${set}  ${n} file(s)`));
    console.log(
      `  Review the scores above, then run with --update-baseline to accept them.\n` +
        `  Until then these files can regress without failing anything.`
    );
  }

  if (regressions.length) {
    console.log(`\nREGRESSIONS vs baseline (${regressions.length}):`);
    regressions.forEach(r => console.log(`  ${r}`));
    process.exitCode = 1;
    return;
  }

  console.log(`\nReport: ${path.relative(process.cwd(), path.join(RESULTS_DIR, 'comparison.html'))}`);
}

run().catch(err => {
  console.error('Harness failed:', err);
  process.exit(1);
});
