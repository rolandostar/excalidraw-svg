import fs from 'node:fs';
import path from 'node:path';
import type { ScoredFile } from './score';
import { readExpectedFailures as readSuiteExpectedFailures, type Config } from './config';

/**
 * What counts as a failure, and how a run is reported.
 *
 *   thresholds   the published limits, and the one predicate that applies them
 *   gate         baselines, expected failures, corpus-level checks, exit code
 *   html         the comparison page written to tests/results/
 */

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

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

/**
 * Turning scored files into a verdict.
 *
 * Three independent things can fail a run, and each is reported separately
 * because they mean different things: a file that *errored* is a broken
 * harness or a broken input, a file over threshold is a conversion that is
 * wrong today, and a regression is a conversion that got worse than the
 * committed reference. A run that only checked the last of those - which this
 * one used to - passes green while every icon is visibly broken, as long as it
 * was equally broken last time.
 */


// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

export interface GateResult {
  /** Ids whose shape score is worse than the baseline by more than the slack. */
  regressions: string[];
  /**
   * Ids the baseline has never seen.
   *
   * There is nothing to compare these against, so they cannot be checked for a
   * regression - and that is exactly why they fail the run. Reporting them and
   * carrying on would let a whole new icon set land with silent exemption from
   * the suite, which is the one failure this harness exists to prevent.
   *
   * The fix is to look at the scores and run with `--update-baseline`.
   */
  unbaselined: string[];
  baselineWritten: 'created' | 'updated' | null;
  /**
   * Cases listed as expected failures that now pass.
   *
   * Good news, but still worth saying out loud: the limit moved, so the entry
   * should come out of the file. Reported, not fatal.
   */
  unexpectedPasses: string[];
  /** Non-empty means exit 1. One readable line per cause. */
  reasons: string[];
}

export function readBaseline(config: Config): Record<string, number> | null {
  return fs.existsSync(config.baselineFile)
    ? (JSON.parse(fs.readFileSync(config.baselineFile, 'utf-8')) as Record<string, number>)
    : null;
}

/**
 * Cases that are meant to fail, mapped to the reason.
 *
 * A few of the torture files cannot pass and should not. One is made entirely
 * of features the converter refuses to guess at. One measures the colour a
 * flattened gradient loses. Two are so small that the measurement itself
 * dominates the number. They hold documented limits in place: if this suite
 * ever reported zero failures, it would mean a threshold had been loosened or
 * the cases had been deleted.
 *
 * Keeping the list in a file rather than in the gate means it is reviewable in
 * a diff, and the website reads the same reasons rather than repeating them.
 */
export function readExpectedFailures(config: Config): Record<string, string> {
  return readSuiteExpectedFailures(config.suite);
}

/**
 * The one thing a single icon cannot see: two icons minting the same `fileId`,
 * which would make the merged `files` map silently drop one of them.
 */
export function corpusIssues(scored: ScoredFile[]): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();

  for (const file of scored) {
    for (const id of file.fileIds) {
      if (seen.has(id)) {
        issues.push(
          `package: fileId "${id}" is generated by more than one icon - the merged files map would drop one`
        );
      }
      seen.add(id);
    }
  }

  return issues;
}

export function summarise(metrics: IconMetrics[], extraIssues: string[]): Summary {
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const shapeScores = metrics.filter(m => m.shapeScore !== null).map(m => m.shapeScore as number);
  const placements = metrics
    .filter(m => m.placementErrorPx !== null)
    .map(m => m.placementErrorPx as number);

  return {
    generatedAt: new Date().toISOString(),
    totalProcessed: metrics.length,
    meanShapeScore: mean(shapeScores),
    worstShapeScore: shapeScores.length ? Math.max(...shapeScores) : 0,
    meanPlacementErrorPx: mean(placements),
    worstPlacementErrorPx: placements.length ? Math.max(...placements) : 0,
    failingIcons: metrics.filter(m => isFailing(m, DEFAULT_THRESHOLDS)).length,
    auditIssueCount: metrics.reduce((n, m) => n + m.auditIssues.length, 0) + extraIssues.length,
    thresholds: DEFAULT_THRESHOLDS,
    icons: metrics,
  };
}

export function applyGate(
  config: Config,
  summary: Summary,
  baseline: Record<string, number> | null,
  expectedFailures: Record<string, string> = {}
): GateResult {
  const scores: Record<string, number> = {};
  summary.icons.forEach(m => {
    if (m.shapeScore !== null) scores[m.id] = Number(m.shapeScore.toFixed(6));
  });

  const regressions: string[] = [];
  const unbaselined: string[] = [];
  let baselineWritten: GateResult['baselineWritten'] = null;



  // A `--only` run sees a subset of icons, so it must never be allowed to
  // read a partial verdict from - or write a partial reference to - the
  // full-corpus baseline.
  if (config.only) {
    // nothing read, nothing written
  } else if (config.updateBaseline) {
    fs.mkdirSync(path.dirname(config.baselineFile), { recursive: true });
    fs.writeFileSync(config.baselineFile, JSON.stringify(scores, null, 2), 'utf-8');
    baselineWritten = baseline ? 'updated' : 'created';
  } else {
    // A missing baseline file is NOT quietly written here. A suite that mints
    // its own reference on first run has never been reviewed by anyone, and it
    // would then pass forever at whatever quality it happened to launch with.
    for (const [id, score] of Object.entries(scores)) {
      const before = baseline?.[id];
      if (before === undefined) {
        unbaselined.push(id);
      } else if (score > before + summary.thresholds.regressionSlack) {
        regressions.push(`${id}: ${(before * 100).toFixed(2)}% -> ${(score * 100).toFixed(2)}%`);
      }
    }
  }

  const failing = summary.icons.filter(m => isFailing(m, summary.thresholds));

  // Over threshold and nobody has agreed to it. The regression check below
  // catches a listed case that gets *worse*, so an expected failure holding
  // steady is not a reason to fail the run.
  const unexpectedFailures = failing.filter(m => !(m.id in expectedFailures)).map(m => m.id);

  const unexpectedPasses = Object.keys(expectedFailures).filter(
    id => summary.icons.some(m => m.id === id) && !failing.some(m => m.id === id)
  );

  const errored = summary.icons.filter(m => m.error);
  const reasons: string[] = [];

  if (errored.length) {
    reasons.push(`${errored.length} file(s) errored during scoring`);
  }
  if (unexpectedFailures.length) {
    reasons.push(
      `${unexpectedFailures.length} file(s) over the thresholds ` +
        `(shape > ${(summary.thresholds.shapeScore * 100).toFixed(0)}%, ` +
        `placement > ${summary.thresholds.placementErrorPx}px, or any audit issue): ` +
        unexpectedFailures.join(', ')
    );
  }
  if (unbaselined.length) {
    reasons.push(
      `${unbaselined.length} file(s) have no baseline entry, so nothing is checking them. ` +
        `Review the scores above, then re-run with --update-baseline`
    );
  }
  if (regressions.length) {
    reasons.push(
      `${regressions.length} shape-score regression(s) vs ` +
        path.relative(process.cwd(), config.baselineFile)
    );
  }

  return { regressions, unbaselined, baselineWritten, unexpectedPasses, reasons };
}

const pct = (v: number | null) => (v === null ? 'n/a' : `${(v * 100).toFixed(2)}%`);
const px = (v: number | null) => (v === null ? 'n/a' : `${v.toFixed(2)}px`);

// ---------------------------------------------------------------------------
// The HTML report
// ---------------------------------------------------------------------------

export function buildHtmlReport(summary: Summary, baseline: Record<string, number> | null): string {
  const rows = [...summary.icons].sort((a, b) => (b.shapeScore ?? 1) - (a.shapeScore ?? 1));

  const cards = rows
    .map(icon => {
      const failing = isFailing(icon, summary.thresholds);

      const base = baseline?.[icon.id];
      const delta =
        base === undefined || icon.shapeScore === null
          ? ''
          : `<span class="delta ${icon.shapeScore > base + summary.thresholds.regressionSlack ? 'worse' : icon.shapeScore < base - 1e-9 ? 'better' : ''}">${
              icon.shapeScore > base ? '+' : ''
            }${((icon.shapeScore - base) * 100).toFixed(2)}pp vs baseline</span>`;

      return `
    <div class="card ${failing ? 'fail' : 'pass'}" data-id="${icon.id}" data-title="${icon.title.toLowerCase()}" data-state="${failing ? 'fail' : 'pass'}">
      <div class="head">
        <span class="name">${icon.title}</span>
        <span class="badge ${failing ? 'b-fail' : 'b-pass'}">${pct(icon.shapeScore)}</span>
      </div>
      <img loading="lazy" src="comparisons/${icon.id}.png" alt="${icon.title}" />
      <div class="meta">
        <span>placement ${px(icon.placementErrorPx)}</span>
        <span>${icon.elementCount} elem</span>
        ${delta}
      </div>
      ${icon.featureWarnings ? `<div class="warn">${icon.featureWarnings}</div>` : ''}
      ${icon.auditIssues.length ? `<ul class="issues">${icon.auditIssues.map(i => `<li>${i}</li>`).join('')}</ul>` : ''}
      ${icon.error ? `<div class="issues"><li>${icon.error}</li></div>` : ''}
    </div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>Excalidraw GCP - Conversion Fidelity</title>
<style>
  body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f1f3f4;color:#202124;margin:0;padding:24px}
  header{background:#fff;border:1px solid #e0e0e0;border-radius:12px;padding:20px 28px;margin-bottom:20px}
  h1{margin:0 0 12px;font-size:22px}
  .stats{display:flex;gap:28px;flex-wrap:wrap;font-size:14px;color:#5f6368}
  .stats b{color:#202124;font-variant-numeric:tabular-nums}
  .controls{margin-top:16px;display:flex;gap:12px;align-items:center}
  input,select{padding:8px 12px;border:1px solid #e0e0e0;border-radius:6px;font-size:14px}
  input{width:260px}
  .legend{font-size:12px;color:#5f6368;margin-top:10px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:16px}
  .card{background:#fff;border:1px solid #e0e0e0;border-radius:10px;padding:12px}
  .card.fail{border-color:#d93025;box-shadow:0 0 0 1px rgba(217,48,37,.25)}
  .head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
  .name{font-weight:600;font-size:14px}
  .badge{font-size:12px;font-weight:700;padding:3px 8px;border-radius:12px;font-variant-numeric:tabular-nums}
  .b-pass{background:#e6f4ea;color:#137333}
  .b-fail{background:#fce8e6;color:#c5221f}
  .card img{width:100%;height:auto;display:block;border-radius:6px;background:#fff}
  .meta{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:#5f6368;margin-top:8px;font-variant-numeric:tabular-nums}
  .delta.worse{color:#c5221f;font-weight:700}
  .delta.better{color:#137333;font-weight:700}
  .issues{margin:8px 0 0;padding-left:18px;font-size:12px;color:#c5221f}
  .warn{margin-top:8px;font-size:12px;color:#b06000;background:#feefc3;border-radius:4px;padding:4px 8px}
</style></head><body>
<header>
  <h1>Excalidraw GCP - Conversion Fidelity</h1>
  <div class="stats">
    <span>icons <b>${summary.totalProcessed}</b></span>
    <span>failing <b style="color:#c5221f">${summary.failingIcons}</b></span>
    <span>mean shape error <b>${pct(summary.meanShapeScore)}</b></span>
    <span>worst shape error <b>${pct(summary.worstShapeScore)}</b></span>
    <span>mean placement <b>${px(summary.meanPlacementErrorPx)}</b></span>
    <span>worst placement <b>${px(summary.worstPlacementErrorPx)}</b></span>
    <span>audit issues <b>${summary.auditIssueCount}</b></span>
  </div>
  <div class="controls">
    <input id="q" placeholder="Search icons..." oninput="f()" />
    <select id="s" onchange="f()">
      <option value="all">All</option>
      <option value="fail">Failing only</option>
      <option value="pass">Passing only</option>
    </select>
  </div>
  <div class="legend">Each strip: <b>source SVG</b> &middot; <b>Excalidraw render</b> &middot; <b>pixel diff</b>. Both sides framed on their own ink box, so the strip shows shape error only; placement error is reported separately. Sorted worst first.</div>
</header>
<div class="grid">${cards}</div>
<script>
function f(){
  var q=document.getElementById('q').value.toLowerCase(),s=document.getElementById('s').value;
  document.querySelectorAll('.card').forEach(function(c){
    var okQ=c.dataset.title.indexOf(q)>-1||c.dataset.id.toLowerCase().indexOf(q)>-1;
    var okS=s==='all'||c.dataset.state===s;
    c.style.display=okQ&&okS?'':'none';
  });
}
</script>
</body></html>`;
}
