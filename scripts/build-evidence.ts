/**
 * Publishes harness output as a committed website asset.
 *
 * The site claims specific numbers. Those numbers have to come from the same
 * artifact the regression gate reads, or the marketing copy and the test suite
 * will drift apart - which is the exact failure mode the whole project is
 * built to avoid.
 *
 * `tests/results/` is regenerable and gitignored, and the harness needs a
 * native rasteriser (`@resvg/resvg-js`) that a static web build should not
 * have to depend on. So this script freezes the parts the site needs into
 * `public/evidence/`, which IS committed:
 *
 *   src/generated/evidence-headline.json  ~20 numbers, imported into the bundle
 *   public/evidence/manifest.json         per-case detail, fetched on demand
 *   public/evidence/torture/<id>.png      all triptychs (source | output | diff)
 *   public/evidence/icons/<id>.png        triptychs for the worst N icons only
 *
 * The split matters: the landing page quotes four numbers and must not pay
 * 60 KB of per-case JSON to do it, while the methodology page needs all of it.
 * The headline lives under `src/` because Vite refuses to bundle imports out
 * of `public/`, and it must be bundled - a fetch would leave the hero briefly
 * quoting nothing.
 *
 * Run after the harness:
 *   pnpm test && pnpm test:torture && pnpm evidence
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isFailing } from './lib/thresholds';
import type { Summary } from './lib/thresholds';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESULTS = path.join(ROOT, 'tests', 'results');
const TORTURE_SRC = path.join(ROOT, 'tests', 'torture-svg');
const OUT = path.join(ROOT, 'public', 'evidence');
const HEADLINE_FILE = path.join(ROOT, 'src', 'generated', 'evidence-headline.json');

/** Triptychs for icons are ~20 KB each and 214 of 216 score exactly zero. */
const WORST_ICONS_TO_PUBLISH = 6;

export interface EvidenceCase {
  id: string;
  /** Display label: numeric ordering prefix removed. */
  label: string;
  shapeScore: number | null;
  placementErrorPx: number | null;
  elementCount: number;
  /** Why this case exists, taken from the comment at the top of the SVG. */
  trap?: string;
  featureWarnings?: string;
  auditIssues: string[];
  /** True when this case is over one of the published thresholds. */
  failing: boolean;
  /**
   * Set when the case is meant to fail. The text is the reason, copied from
   * `tests/baselines/<suite>.expected-failures.json` - the same file the gate
   * reads, so the page and the gate cannot disagree.
   */
  expectedFailureReason?: string;
  /** Present only when a triptych was published for this case. */
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
  thresholds: Summary['thresholds'];
  icons: EvidenceSuite;
  torture: EvidenceSuite;
}

/** The subset small enough to inline in the JS bundle. */
export type EvidenceHeadline = {
  builtAt: string;
  thresholds: Summary['thresholds'];
} & {
  [K in 'icons' | 'torture']: Omit<EvidenceSuite, 'cases'>;
};

function readSummary(suite: string): Summary {
  const file = path.join(RESULTS, suite, 'summary.json');
  if (!fs.existsSync(file)) {
    throw new Error(
      `Missing ${path.relative(ROOT, file)}.\n` +
        `Run the harness first:  pnpm test && pnpm test:torture`
    );
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as Summary;
}

/**
 * Every torture SVG opens with a comment explaining the trap it catches.
 * Reading it here keeps the gallery captions and the fixtures in one place -
 * a new fixture documents itself on the site with no extra step.
 */
function readTrap(id: string): string | undefined {
  const file = path.join(TORTURE_SRC, `${id}.svg`);
  if (!fs.existsSync(file)) return undefined;

  const head = fs.readFileSync(file, 'utf-8').slice(0, 1200);
  const match = head.match(/^\s*<!--([\s\S]*?)-->/);
  if (!match) return undefined;

  return match[1]
    .split('\n')
    .map(line => line.trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const stripOrderPrefix = (title: string) => title.replace(/^\d+[-\s]+/, '');

/**
 * The reasons a case is allowed to fail, straight from the file the gate reads.
 *
 * The website used to keep its own copy of this list. Two copies of the same
 * four explanations drift, and the one on the page is the one nobody runs.
 */
function readExpectedFailures(suite: string): Record<string, string> {
  const file = path.resolve(process.cwd(), 'tests/baselines', `${suite}.expected-failures.json`);
  return fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, string>)
    : {};
}

function publish(
  suite: string,
  summary: Summary,
  selectIds: Set<string>,
  withTraps: boolean
): EvidenceSuite {
  const expectedFailures = readExpectedFailures(suite);
  const imageDir = path.join(OUT, suite);
  fs.mkdirSync(imageDir, { recursive: true });

  const cases: EvidenceCase[] = summary.icons.map(icon => {
    let image: string | undefined;

    if (selectIds.has(icon.id)) {
      const src = path.join(RESULTS, suite, 'comparisons', `${icon.id}.png`);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(imageDir, `${icon.id}.png`));
        image = `${suite}/${icon.id}.png`;
      }
    }

    return {
      id: icon.id,
      label: stripOrderPrefix(icon.title),
      shapeScore: icon.shapeScore,
      placementErrorPx: icon.placementErrorPx,
      elementCount: icon.elementCount,
      trap: withTraps ? readTrap(icon.id) : undefined,
      featureWarnings: icon.featureWarnings,
      auditIssues: icon.auditIssues,
      failing: isFailing(icon, summary.thresholds),
      expectedFailureReason: expectedFailures[icon.id],
      image,
    };
  });

  return {
    name: suite,
    generatedAt: summary.generatedAt,
    total: summary.totalProcessed,
    meanShapeScore: summary.meanShapeScore,
    worstShapeScore: summary.worstShapeScore,
    meanPlacementErrorPx: summary.meanPlacementErrorPx,
    worstPlacementErrorPx: summary.worstPlacementErrorPx,
    failing: summary.failingIcons,
    auditIssueCount: summary.auditIssueCount,
    cases,
  };
}

function run() {
  const iconsSummary = readSummary('icons');
  const tortureSummary = readSummary('torture');

  // Wipe first so a renamed or deleted fixture cannot leave a stale PNG behind.
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  // Every torture case gets an image - the gallery is the point of the page.
  const tortureIds = new Set(tortureSummary.icons.map(i => i.id));

  // Icons publish only the interesting tail: anything non-zero or failing, so
  // "0.000% mean" is backed by a visible non-trivial example. Padding this out
  // with icons that score exactly zero would put six identical strips under a
  // heading that says "the worst ones", which reads as a hedge.
  const iconIds = new Set(
    [...iconsSummary.icons]
      .filter(icon => (icon.shapeScore ?? 0) > 0 || isFailing(icon, iconsSummary.thresholds))
      .sort((a, b) => (b.shapeScore ?? 0) - (a.shapeScore ?? 0))
      .slice(0, WORST_ICONS_TO_PUBLISH)
      .map(i => i.id)
  );

  const manifest: EvidenceManifest = {
    builtAt: new Date().toISOString(),
    thresholds: iconsSummary.thresholds,
    icons: publish('icons', iconsSummary, iconIds, false),
    torture: publish('torture', tortureSummary, tortureIds, true),
  };

  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  const { cases: _iconCases, ...iconsHeadline } = manifest.icons;
  const { cases: _tortureCases, ...tortureHeadline } = manifest.torture;
  const headline: EvidenceHeadline = {
    builtAt: manifest.builtAt,
    thresholds: manifest.thresholds,
    icons: iconsHeadline,
    torture: tortureHeadline,
  };
  fs.mkdirSync(path.dirname(HEADLINE_FILE), { recursive: true });
  fs.writeFileSync(HEADLINE_FILE, JSON.stringify(headline, null, 2), 'utf-8');

  const bytes = (dir: string) =>
    fs.existsSync(dir)
      ? fs.readdirSync(dir).reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0)
      : 0;

  const total = bytes(OUT) + bytes(path.join(OUT, 'icons')) + bytes(path.join(OUT, 'torture'));

  console.log(`Evidence written to ${path.relative(ROOT, OUT)}`);
  console.log(`  icons    ${manifest.icons.total} cases, ${iconIds.size} triptychs, ${manifest.icons.failing} failing`);
  console.log(`  torture  ${manifest.torture.total} cases, ${tortureIds.size} triptychs, ${manifest.torture.failing} failing`);
  console.log(`  size     ${(total / 1024).toFixed(0)} KB`);

  const missingTraps = manifest.torture.cases.filter(c => !c.trap).map(c => c.id);
  if (missingTraps.length) {
    console.warn(
      `\nWARNING: ${missingTraps.length} torture case(s) have no leading comment, so they ` +
        `will appear in the gallery with no explanation:\n  ${missingTraps.join('\n  ')}`
    );
  }
}

run();
