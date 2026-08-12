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
