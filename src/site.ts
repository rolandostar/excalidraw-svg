/**
 * Site-wide constants.
 *
 * Anything here that looks like a claim must be traceable to a committed
 * artifact. The numbers come from `src/generated/evidence-headline.json`, which
 * `scripts/build-evidence.ts` freezes from the same harness output the
 * regression gate reads - so the copy on the page cannot drift away from what
 * the suite actually measures.
 *
 * Do not compute these from `tests/baselines/*.json`. Baselines record shape
 * error only, but the gate also fails a case on placement error, so a count
 * derived from them under-reports failures.
 */
import headline from './generated/evidence-headline.json';

export const REPO_URL = 'https://github.com/rolandostar/excalidraw-svg';
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
