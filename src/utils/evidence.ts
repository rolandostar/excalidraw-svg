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

export interface EvidenceSuite {
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

export function loadEvidence(): Promise<EvidenceManifest> {
  cached ??= fetch('/evidence/manifest.json').then(res => {
    if (!res.ok) throw new Error(`Evidence manifest unavailable (${res.status})`);
    return res.json() as Promise<EvidenceManifest>;
  });
  return cached;
}

export const evidenceImageUrl = (image: string) => `/evidence/${image}`;
