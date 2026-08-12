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
import { readExpectedFailures } from './fidelity/config';
import { isFailing, type Summary } from './fidelity/report';
import { renderClaimsBlock, writeClaimsBlock } from './lib/claims';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESULTS = path.join(ROOT, 'tests', 'results');
const TORTURE_SRC = path.join(ROOT, 'tests', 'torture-svg');
const OUT = path.join(ROOT, 'public', 'evidence');
const HEADLINE_FILE = path.join(ROOT, 'src', 'generated', 'evidence-headline.json');

/**
 * Sanity ceiling on how many imperfect icons we are willing to publish.
 *
 * NOT a display cap. Every icon that scores above zero is published, because
 * the methodology page calls that list complete and it has to be. This exists
 * so that a change which quietly makes a hundred icons imperfect fails the
 * build instead of shipping a hundred triptychs.
 *
 * This replaced a hard cap of 6, which silently truncated the list the moment
 * a seventh icon became imperfect - and the page went on calling it complete.
 */
const MAX_IMPERFECT_ICONS = 40;

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
  /** Cases that are a pixel-exact match. Counted from scores, not from images. */
  perfect: number;
  imperfect: number;
  /** Per-set counts, for suites whose ids are `<set>__<name>`. */
  sets: { id: string; count: number }[];
  meanShapeScore: number;
  worstShapeScore: number;
  meanPlacementErrorPx: number;
  worstPlacementErrorPx: number;
  failing: number;
  /** How many cases are listed as meant to fail. */
  expectedFailures: number;
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
  // The prolog is optional and only two fixtures carry one, which is exactly
  // why skipping only whitespace went unnoticed: those two published with no
  // explanation while the warning below blamed a missing comment.
  const match = head.match(/^\s*(?:<\?xml[^?]*\?>\s*)?<!--([\s\S]*?)-->/);
  if (!match) return undefined;

  return match[1]
    .split('\n')
    .map(line => line.trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const stripOrderPrefix = (title: string) => title.replace(/^\d+[-\s]+/, '');

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
      if (!fs.existsSync(src)) {
        // The harness writes a triptych for every case with a non-empty diff,
        // so a selected case without one means summary.json and the results
        // directory came from different runs. Copying what is there and
        // staying quiet is how the page ended up calling six cases "complete"
        // when there were eight.
        throw new Error(
          `${suite}/${icon.id} scores ${((icon.shapeScore ?? 0) * 100).toFixed(4)}% but has no\n` +
            `comparison image at ${path.relative(ROOT, src)}.\n` +
            `The summary and the results directory disagree - re-run the suite.`
        );
      }
      fs.copyFileSync(src, path.join(imageDir, `${icon.id}.png`));
      image = `${suite}/${icon.id}.png`;
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

  // Counted from the scores, never from how many images happened to be
  // published. Deriving it from the image count is exactly how the site came
  // to claim 255 perfect icons when the real figure was 253.
  const perfect = summary.icons.filter(icon => icon.shapeScore === 0).length;

  // Set ids are the part of the case id before `__`; a suite with no sets
  // (torture) leaves this empty rather than inventing one.
  const bySet = new Map<string, number>();
  for (const icon of summary.icons) {
    const cut = icon.id.indexOf('__');
    if (cut > 0) bySet.set(icon.id.slice(0, cut), (bySet.get(icon.id.slice(0, cut)) ?? 0) + 1);
  }

  return {
    name: suite,
    generatedAt: summary.generatedAt,
    total: summary.totalProcessed,
    perfect,
    imperfect: summary.totalProcessed - perfect,
    sets: [...bySet].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, count })),
    meanShapeScore: summary.meanShapeScore,
    worstShapeScore: summary.worstShapeScore,
    meanPlacementErrorPx: summary.meanPlacementErrorPx,
    worstPlacementErrorPx: summary.worstPlacementErrorPx,
    failing: summary.failingIcons,
    expectedFailures: Object.keys(expectedFailures).length,
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

  // Icons publish the interesting tail: every case that is not a pixel-exact
  // match. Padding it out with icons scoring exactly zero would put identical
  // strips under a heading about the worst ones, which reads as a hedge - but
  // leaving any of them out makes the page's "complete list" a lie.
  const imperfect = [...iconsSummary.icons]
    .filter(icon => (icon.shapeScore ?? 0) > 0 || isFailing(icon, iconsSummary.thresholds))
    .sort((a, b) => (b.shapeScore ?? 0) - (a.shapeScore ?? 0));

  if (imperfect.length > MAX_IMPERFECT_ICONS) {
    throw new Error(
      `${imperfect.length} icons score above zero, over the ${MAX_IMPERFECT_ICONS} ceiling.\n` +
        `Something has regressed. Publishing a truncated list would hide it - fix the\n` +
        `conversion, or raise MAX_IMPERFECT_ICONS deliberately if this is the new normal.`
    );
  }

  const iconIds = new Set(imperfect.map(i => i.id));

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

  // The README quotes the same figures. Rewriting them here is what stops the
  // two drifting; `claims.test.ts` fails if this was not re-run.
  const readmeFile = path.join(ROOT, 'README.md');
  fs.writeFileSync(
    readmeFile,
    writeClaimsBlock(fs.readFileSync(readmeFile, 'utf-8'), renderClaimsBlock(headline)),
    'utf-8'
  );

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
