import headline from './generated/evidence-headline.json';

/**
 * Facts about the site itself: where its source lives, how numbers are
 * formatted, and the measured figures the pages quote.
 *
 * The figures are generated - `pnpm evidence` writes
 * `generated/evidence-headline.json` from a real harness run - so a page
 * cannot quote a number nobody measured.
 */

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

export const REPO_URL = 'https://github.com/rolandostar/excalidraw-svg';
export const WIKI_URL = `${REPO_URL}/wiki`;
export const NEW_ISSUE_URL = `${REPO_URL}/issues/new`;

export const STATS = {
  iconCount: headline.icons.total,
  /**
   * Pixel-exact icons, counted from their scores.
   *
   * Never derive this from how many comparison images got published. The two
   * used to be the same number by accident, then a publishing cap held at six
   * while the real count moved, and the site spent a while claiming 255
   * perfect icons when there were 253.
   */
  iconPerfect: headline.icons.perfect,
  iconImperfect: headline.icons.imperfect,
  iconSets: headline.icons.sets,
  iconMeanError: headline.icons.meanShapeScore,
  iconWorstError: headline.icons.worstShapeScore,
  iconFailures: headline.icons.failing,
  tortureCount: headline.torture.total,
  /**
   * The count the pages describe as "fail on purpose", so it has to be the
   * *expected* failures, not the observed ones.
   *
   * They are equal whenever the build is green - the gate exits non-zero on
   * any failure that is not listed - so reading `failing` was right by
   * coincidence rather than by construction, and would have started lying on
   * the first unplanned failure.
   */
  tortureExpectedFailures: headline.torture.expectedFailures,
  tortureFailures: headline.torture.failing,
  shapeThreshold: headline.thresholds.shapeScore,
  placementThresholdPx: headline.thresholds.placementErrorPx,
} as const;

export const formatPct = (v: number, digits = 3) => `${(v * 100).toFixed(digits)}%`;
export const formatPx = (v: number) => `${v.toFixed(2)}px`;

/**
 * Loader for the published evidence manifest.
 *
 * The manifest is ~60 KB of per-case detail and only the methodology page
 * needs it, so it is fetched rather than bundled. The headline numbers quoted
 * on every page come from `src/generated/evidence-headline.json` instead,
 * which is small enough to inline and avoids the hero briefly quoting nothing.
 */
export interface EvidenceCase {
  id: string;
  label: string;
  shapeScore: number | null;
  placementErrorPx: number | null;
  elementCount: number;
  trap?: string;
  featureWarnings?: string;
  auditIssues: string[];
  failing: boolean;
  /** Set when the case is meant to fail. The text says why. */
  expectedFailureReason?: string;
  image?: string;
}

interface EvidenceSuite {
  name: string;
  generatedAt: string;
  total: number;
  meanShapeScore: number;
  worstShapeScore: number;
  meanPlacementErrorPx: number;
  worstPlacementErrorPx: number;
  failing: number;
  auditIssueCount: number;
  cases: EvidenceCase[];
}

export interface EvidenceManifest {
  builtAt: string;
  thresholds: { shapeScore: number; placementErrorPx: number; regressionSlack: number };
  icons: EvidenceSuite;
  torture: EvidenceSuite;
}

let cached: Promise<EvidenceManifest> | null = null;

/**
 * Where `public/` ends up once deployed. Always has a trailing slash, so the
 * paths below are relative to it and never start with one - an absolute
 * `/evidence/...` would look for the file at the domain root, which on a
 * GitHub Pages project page is somebody else's site.
 */
const BASE = import.meta.env?.BASE_URL ?? '/';

export function loadEvidence(): Promise<EvidenceManifest> {
  cached ??= fetch(`${BASE}evidence/manifest.json`).then(res => {
    if (!res.ok) throw new Error(`Evidence manifest unavailable (${res.status})`);
    return res.json() as Promise<EvidenceManifest>;
  });
  return cached;
}

export const evidenceImageUrl = (image: string) => `${BASE}evidence/${image}`;
