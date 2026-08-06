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

import fs from 'fs';
import path from 'path';

import { DEFAULT_EXCALIDRAW_OPTIONS } from '../src/utils/defaultOptions';
import { optimizeSvgString } from '../src/utils/svgOptimizer';
import {
  parseSvgToExcalidrawElements,
  createExcalidrawItem,
  buildExcalidrawLibraryPackage,
  buildExcalidrawClipboardData,
} from '../src/utils/excalidrawGenerator';
import { categorizeIcon, formatTitle } from '../src/utils/categorizer';
import { collectUnsupportedFeatures, describeWarnings } from '../src/utils/svgSupport';
import { GCPIcon } from '../src/types';

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

function ensureDirs() {
  for (const dir of [RESULTS_DIR, ELEMENTS_DIR, COMPARISONS_DIR, path.dirname(BASELINE_FILE)]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** Mirrors `svgLoader.loadAllGCPIcons` so the harness feeds the shipped code the same shape of input. */
function buildIcon(name: string, rawSvg: string): GCPIcon {
  const optimizedSvg = optimizeSvgString(rawSvg);
  const viewBox = readViewBox(optimizedSvg) ?? { x: 0, y: 0, width: 48, height: 48 };
  const title = formatTitle(name);
  const encoded = encodeURIComponent(optimizedSvg).replace(/'/g, '%27').replace(/"/g, '%22');

  return {
    id: name,
    name,
    title,
    category: categorizeIcon(name),
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

async function run() {
  ensureDirs();

  let files = fs.readdirSync(INPUT_DIR).filter(f => f.toLowerCase().endsWith('.svg'));
  if (onlyFilter) files = files.filter(f => f.toLowerCase().includes(onlyFilter));

  console.log(`Suite "${SUITE}": scoring ${files.length} SVG(s) from ${path.relative(process.cwd(), INPUT_DIR)}`);

  const baseline: Record<string, number> | null = fs.existsSync(BASELINE_FILE)
    ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8'))
    : null;

  const icons: GCPIcon[] = [];
  const metrics: IconMetrics[] = [];
  const startedAt = Date.now();

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const name = path.basename(filename, '.svg');
    const rawSvg = fs.readFileSync(path.join(INPUT_DIR, filename), 'utf-8');

    const record: IconMetrics = {
      id: name,
      title: formatTitle(name),
      category: categorizeIcon(name),
      elementCount: 0,
      shapeScore: null,
      placementErrorPx: null,
      auditIssues: [],
      rawBytes: rawSvg.length,
      optimizedBytes: 0,
    };

    try {
      const icon = buildIcon(name, rawSvg);
      icons.push(icon);
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
          fs.writeFileSync(
            path.join(COMPARISONS_DIR, `${name}.png`),
            composeTriptych([shape.source, shape.scene, shape.diff])
          );
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
    } catch (err: any) {
      record.error = err?.message || String(err);
      record.shapeScore = 1;
    }

    metrics.push(record);

    if ((i + 1) % 25 === 0 || i + 1 === files.length) {
      console.log(`  ${i + 1}/${files.length}`);
    }
  }

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
  const scored = metrics.filter(m => m.shapeScore !== null).map(m => m.shapeScore as number);
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
    meanShapeScore: mean(scored),
    worstShapeScore: scored.length ? Math.max(...scored) : 0,
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
  if (baseline && !updateBaseline && !onlyFilter) {
    for (const [id, score] of Object.entries(currentScores)) {
      const before = baseline[id];
      if (before === undefined) continue;
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
