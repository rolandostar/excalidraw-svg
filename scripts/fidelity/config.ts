/**
 * Everything the run is parameterised by, parsed from `process.argv` exactly
 * once.
 *
 * `childArgs` lives here too, deliberately: a forked worker has to reproduce
 * the parent's output policy, and the only way to guarantee that is for the
 * code that reads a flag and the code that forwards it to sit in the same
 * file. They used to be 500 lines apart.
 *
 * This module must stay free of any import that touches the DOM - it is read
 * before `setupDom` has necessarily done its work in every entry point.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { flag as readFlag } from '../lib/env';

// Type-only: this module must not drag the native rasteriser (or anything
// else) into a process that only wants to read a flag.
import type { Box } from '../lib/raster';

/** The scene-space box every icon is fitted into before scoring. */
export const TARGET = { x: 0, y: 0, width: 48, height: 48 } as const;

/** Side of the square comparison panels, in pixels. */
export const PANEL_SIZE = 320;

/**
 * Slack around the target box so a stroke sitting on the artwork's edge - and
 * the round cap Excalidraw adds to it - stays inside the comparison window.
 */
const FRAME_MARGIN = 6;

export const SCENE_WINDOW: Box = {
  x: TARGET.x - FRAME_MARGIN,
  y: TARGET.y - FRAME_MARGIN,
  width: TARGET.width + FRAME_MARGIN * 2,
  height: TARGET.height + FRAME_MARGIN * 2,
};

/** Upper bound on workers, regardless of how many cores are reported. */
const MAX_JOBS = 8;

export interface Config {
  readonly inputDir: string;
  /** Selects both the results folder and the baseline file, so two corpora never collide. */
  readonly suite: string;
  readonly resultsDir: string;
  readonly comparisonsDir: string;
  readonly baselineFile: string;
  /**
   * Cases that are meant to fail, and why. Optional; most suites have none.
   * See `readExpectedFailures` in ./gate.ts.
   */
  readonly expectedFailuresFile: string;
  /**
   * Triptych policy. `scored` writes a comparison image only when the diff is
   * non-empty, which spares the great majority of icons an encode they would
   * never be published from. `all` is required by any suite whose every case
   * is published, such as the torture gallery.
   */
  readonly comparisons: 'all' | 'scored';
  readonly updateBaseline: boolean;
  readonly only: string | null;
  readonly jobs: number;
  readonly useCache: boolean;
  readonly help: boolean;
  /** Set on forked children; the path they write their slice of results to. */
  readonly workerOut: string | null;
}

/** Name of the env var a parent uses to tell a child where to write its results. */
export const WORKER_OUT_ENV = 'FIDELITY_WORKER_OUT';

/** Path of the expected-failures file for a suite. Shared with build-evidence. */
const expectedFailuresPath = (suite: string): string =>
  path.resolve(process.cwd(), 'tests/baselines', `${suite}.expected-failures.json`);

/**
 * The reasons a case is allowed to fail, straight from the file the gate reads.
 *
 * The website used to keep its own copy of this list. Two copies of the same
 * four explanations drift, and the one on the page is the one nobody runs.
 */
export function readExpectedFailures(suite: string): Record<string, string> {
  const file = expectedFailuresPath(suite);
  return fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, string>)
    : {};
}

export function parseConfig(argv = process.argv.slice(2)): Config {
  const flag = (name: string) => readFlag(name, argv);

  const inputDir = path.resolve(process.cwd(), flag('input') ?? 'svg');
  const suite = flag('name') ?? path.basename(inputDir).replace(/-svg$/, '');
  const resultsDir = path.resolve(process.cwd(), 'tests/results', suite);

  const comparisons = (flag('comparisons') ?? 'scored') as 'all' | 'scored';
  if (comparisons !== 'all' && comparisons !== 'scored') {
    throw new Error(`--comparisons must be "all" or "scored", got "${comparisons}"`);
  }

  const requestedJobs = Number(flag('jobs') ?? 0);

  return Object.freeze({
    inputDir,
    suite,
    resultsDir,
    comparisonsDir: path.join(resultsDir, 'comparisons'),
    baselineFile: path.resolve(process.cwd(), 'tests/baselines', `${suite}.json`),
    expectedFailuresFile: expectedFailuresPath(suite),
    comparisons,
    updateBaseline: argv.includes('--update-baseline'),
    only: flag('only')?.toLowerCase() ?? null,
    jobs:
      Number.isFinite(requestedJobs) && requestedJobs > 0
        ? Math.floor(requestedJobs)
        : Math.max(1, Math.min(MAX_JOBS, os.cpus().length - 1)),
    useCache: !argv.includes('--no-cache'),
    help: argv.includes('--help') || argv.includes('-h'),
    workerOut: process.env[WORKER_OUT_ENV] || null,
  });
}

/**
 * The flags a child needs to reproduce this run's output policy.
 *
 * Nothing about the corpus is forwarded: a worker is handed its slice
 * explicitly and must never re-walk the input directory.
 */
export function childArgs(config: Config): string[] {
  return [
    `--input=${config.inputDir}`,
    `--name=${config.suite}`,
    `--comparisons=${config.comparisons}`,
    ...(config.useCache ? [] : ['--no-cache']),
  ];
}
