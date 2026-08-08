/**
 * Site-wide constants.
 *
 * Every number the pages quote comes from
 * `src/generated/evidence-headline.json`, which `scripts/build-evidence.ts`
 * writes from the same test output the build gate reads. Hard-coding a figure
 * in a component means the copy and the suite can disagree.
 *
 * Do not compute these from `tests/baselines/*.json`. Baselines record shape
 * error only, but a case can also fail on placement error, so a count derived
 * from them under-reports failures.
 */
import headline from './generated/evidence-headline.json';

export const REPO_URL = 'https://github.com/rolandostar/excalidraw-svg';
export const WIKI_URL = `${REPO_URL}/wiki`;
export const NEW_ISSUE_URL = `${REPO_URL}/issues/new`;

export const STATS = {
  iconCount: headline.icons.total,
  iconMeanError: headline.icons.meanShapeScore,
  iconWorstError: headline.icons.worstShapeScore,
  iconFailures: headline.icons.failing,
  tortureCount: headline.torture.total,
  tortureFailures: headline.torture.failing,
  shapeThreshold: headline.thresholds.shapeScore,
  placementThresholdPx: headline.thresholds.placementErrorPx,
} as const;

export const formatPct = (v: number, digits = 3) => `${(v * 100).toFixed(digits)}%`;
export const formatPx = (v: number) => `${v.toFixed(2)}px`;
