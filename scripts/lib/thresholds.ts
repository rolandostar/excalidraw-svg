/**
 * The shape of a scored run, and the single definition of "failing".
 *
 * Deliberately dependency-free: the harness, the HTML report and
 * `build-evidence.ts` all need these types, and only this module is allowed to
 * decide whether an icon passes. A second copy of the rule elsewhere is how
 * the published evidence and the regression gate drift apart.
 */
export interface IconMetrics {
  id: string;
  title: string;
  category: string;
  elementCount: number;
  /** Mismatched pixels / union ink pixels, 0..1. */
  shapeScore: number | null;
  /** Largest edge or size error in output pixels. */
  placementErrorPx: number | null;
  auditIssues: string[];
  /** Human-readable list of features that cannot be converted exactly. */
  featureWarnings?: string;
  rawBytes: number;
  optimizedBytes: number;
  error?: string;
}

export interface Thresholds {
  shapeScore: number;
  placementErrorPx: number;
  /** Extra shape-score slack allowed against the committed baseline. */
  regressionSlack: number;
}

export interface Summary {
  generatedAt: string;
  totalProcessed: number;
  meanShapeScore: number;
  worstShapeScore: number;
  meanPlacementErrorPx: number;
  worstPlacementErrorPx: number;
  failingIcons: number;
  auditIssueCount: number;
  thresholds: Thresholds;
  icons: IconMetrics[];
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  shapeScore: 0.02,
  placementErrorPx: 0.5,
  regressionSlack: 0.001,
};

/** A null score is treated as the worst possible: nothing measured is not a pass. */
export function isFailing(icon: IconMetrics, thresholds: Thresholds): boolean {
  return Boolean(
    icon.error ||
      icon.auditIssues.length > 0 ||
      (icon.shapeScore ?? 1) > thresholds.shapeScore ||
      (icon.placementErrorPx ?? 99) > thresholds.placementErrorPx
  );
}
