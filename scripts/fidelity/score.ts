/**
 * Scoring one SVG.
 *
 * Pure with respect to other files - it reads one path and writes only to
 * filenames derived from that file's id - which is what makes the fan-out in
 * `pool.ts` safe.
 */
import fs from 'node:fs';
import path from 'node:path';

import { DEFAULT_EXCALIDRAW_OPTIONS } from '../../src/utils/defaultOptions';
import { parseSvgToExcalidrawElements } from '../../src/utils/convert/parseSvg';
import { createExcalidrawItem } from '../../src/utils/layout/buildItem';
import { formatTitle } from '../../src/utils/categorizer';
import { collectUnsupportedFeatures, describeWarnings } from '../../src/utils/svgSupport';
import type { IconAsset } from '../../src/types/icons';

import { renderExcalidrawSceneInWindow, auditSceneFidelity } from '../excalidrawRenderer';
import { composeTriptych, inkBox, readViewBox } from '../lib/raster';
import {
  compareRasterInFrame,
  comparePlacement,
  expectedBounds,
  rasteriseSource,
  sceneWindowToSourceWindow,
  unionBounds,
} from '../lib/fidelity';
import { cacheVersion, readSource, writeSource } from '../lib/sourceCache';
import { IconMetrics } from '../lib/thresholds';

import { Config, PANEL_SIZE, SCENE_WINDOW, TARGET } from './config';
import { Candidate, buildIcon } from './corpus';

/** What one worker hands back for one file. */
export interface ScoredFile {
  record: IconMetrics;
  icon: IconAsset | null;
  /** True when a triptych was actually written, for the run summary. */
  wroteComparison: boolean;
  /** True when the source panel came from the on-disk cache. */
  cacheHit: boolean;
  /** Every `files` key this icon generated, for a cross-corpus collision check. */
  fileIds: string[];
}

export const CACHE_VERSION = cacheVersion({ PANEL_SIZE, TARGET, SCENE_WINDOW });

function describeIssues(prefix: string, issues: ReturnType<typeof auditSceneFidelity>): string[] {
  return issues.map(
    i => `${prefix}: [${i.kind}] element #${i.elementIndex} (${i.elementType}) - ${i.detail}`
  );
}

/**
 * Audits every shipped export path for one icon, and reports the `files` keys
 * it minted.
 *
 * Auditing at the origin rather than at the icon's real grid offset is
 * equivalent - every rule in `auditSceneFidelity` is translation-invariant -
 * and the packaged payloads are a concatenation of these elements plus a merge
 * of these `files` maps, which can only ever add a file an element might
 * reference, never remove one. The clipboard side is checked *after* a JSON
 * round-trip, because that payload reaches Excalidraw as text and anything
 * JSON cannot carry is a real defect. What a single icon cannot see is a
 * `fileId` colliding with another icon's, so the ids go back to the master.
 */
function auditExportPaths(
  icon: IconAsset,
  elements: unknown[],
  options: typeof DEFAULT_EXCALIDRAW_OPTIONS
): { issues: string[]; fileIds: string[] } {
  const item = createExcalidrawItem(icon, options, 0, 0);
  const clipboard = JSON.parse(JSON.stringify({ elements: item.elements, files: item.files }));

  return {
    issues: [
      ...describeIssues('vector', auditSceneFidelity(elements as any)),
      ...describeIssues('clipboard', auditSceneFidelity(clipboard.elements, clipboard.files)),
      // A library item is serialised without its `files` map, so any image
      // element it carries is already broken at this point.
      ...describeIssues('library', auditSceneFidelity(item.elements, {})),
    ],
    fileIds: Object.keys(item.files),
  };
}

export async function scoreFile(candidate: Candidate, config: Config): Promise<ScoredFile> {
  const name = candidate.id;
  const rawSvg = fs.readFileSync(candidate.absPath, 'utf-8');
  let wroteComparison = false;
  let cacheHit = false;
  let fileIds: string[] = [];

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

  try {
    icon = buildIcon(candidate, rawSvg);
    record.category = icon.category;
    record.title = icon.title;
    record.optimizedBytes = icon.rawSvg.length;

    // Reported, never fatal: an approximation is a documented trade-off and
    // an unsupported feature is information the user needs, not a crash.
    const features = collectUnsupportedFeatures(rawSvg);
    if (features.length > 0) record.featureWarnings = describeWarnings(features);

    // --- geometry under test ---------------------------------------------
    const elements = parseSvgToExcalidrawElements(icon.rawSvg, TARGET, {
      groupId: `group_${name.replace(/[^a-zA-Z0-9]/g, '_')}`,
      roughness: DEFAULT_EXCALIDRAW_OPTIONS.iconRoughness,
    });
    record.elementCount = elements.length;

    // --- structural audit of every shipped export path --------------------
    const audit = auditExportPaths(icon, elements, DEFAULT_EXCALIDRAW_OPTIONS);
    record.auditIssues.push(...audit.issues);
    fileIds = audit.fileIds;

    // --- source side: identical every run, so cached on disk --------------
    const cached = config.useCache ? readSource(CACHE_VERSION, rawSvg) : null;
    cacheHit = cached !== null;

    const sourceViewBox = cached ? cached.viewBox : readViewBox(rawSvg);
    const sourceInk = cached ? cached.ink : inkBox(rawSvg);

    let sourceRaster = cached?.raster ?? null;
    if (!sourceRaster && sourceViewBox) {
      const window = sceneWindowToSourceWindow(SCENE_WINDOW, sourceViewBox, TARGET);
      sourceRaster = rasteriseSource(rawSvg, window, PANEL_SIZE);
    }

    if (!cached && sourceRaster && config.useCache) {
      writeSource(CACHE_VERSION, rawSvg, {
        ink: sourceInk,
        viewBox: sourceViewBox,
        raster: sourceRaster,
      });
    }

    // --- fidelity scoring --------------------------------------------------
    if (elements.length > 0 && sourceViewBox && sourceRaster) {
      const scene = await renderExcalidrawSceneInWindow(elements as any, SCENE_WINDOW, {});
      const shape = compareRasterInFrame(
        sourceRaster,
        scene.svg,
        { x: 0, y: 0, width: SCENE_WINDOW.width, height: SCENE_WINDOW.height },
        PANEL_SIZE
      );

      if (shape) {
        record.shapeScore = shape.score;

        // A pixel-identical pair produces a blank diff panel that nothing
        // publishes and nobody opens. Encoding and writing it for every
        // passing file was the single largest source of I/O in the run.
        if (config.comparisons === 'all' || shape.mismatchedPixels > 0) {
          fs.writeFileSync(
            path.join(config.comparisonsDir, `${name}.png`),
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
  } catch (err: any) {
    record.error = err?.message || String(err);
    record.shapeScore = 1;
  }

  return { record, icon, wroteComparison, cacheHit, fileIds };
}
