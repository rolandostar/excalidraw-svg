/**
 * Every line the harness prints. No decisions are made here - callers hand in
 * finished values - so the run's behaviour can be read without wading through
 * formatting, and the formatting can be changed without touching behaviour.
 */
import path from 'node:path';

// Type-only, so this module stays a leaf of the import graph: `corpus.ts`
// imports it, and it must not import anything back.
import type { IconMetrics, Summary } from '../lib/thresholds';
import type { Config } from './config';
import type { GateResult } from './gate';

export const USAGE = `Conversion fidelity harness.

Scores a directory of SVGs through the shipped export path, renders the result
with Excalidraw's own exportToSvg, and pixel-diffs it against the source.

Usage:
  tsx scripts/run-fidelity.ts [options]

Options:
  --input=<dir>          directory of SVGs to score          (default: svg)
  --name=<suite>         results + baseline name             (default: input folder name)
  --only=<substring>     score matching ids only; the baseline is neither read nor written
  --comparisons=<mode>   "scored" writes a triptych only when the diff is
                         non-empty, "all" writes one per file  (default: scored)
  --jobs=<n>             worker processes                    (default: cores-1, max 8)
  --no-cache             re-render the cached source panels
  --update-baseline      accept the current scores as the new reference
  -h, --help             this text

Results land in tests/results/<suite>/ and are gated against
tests/baselines/<suite>.json. The run exits 1 on a scoring error, on any file
over the published thresholds, or on a shape-score regression.`;

export function printHelp(): void {
  console.log(USAGE);
}

export function warnBadManifest(file: string, message: string): void {
  console.warn(`  ! ${file} is not valid JSON: ${message}`);
}

export function printStart(config: Config, fileCount: number, setIds: string[], jobs: number): void {
  console.log(
    `Suite "${config.suite}": scoring ${fileCount} SVG(s) from ` +
      path.relative(process.cwd(), config.inputDir) +
      (setIds.length > 1 ? ` across ${setIds.length} sets (${setIds.join(', ')})` : '') +
      (jobs > 1 ? ` on ${jobs} workers` : '')
  );
}

export function printProgress(done: number, total: number): void {
  if (done % 25 === 0 || done === total) console.log(`  ${done}/${total}`);
}

export function printBaselineNotice(config: Config, written: GateResult['baselineWritten']): void {
  if (config.only) console.log('\n--only run: baseline neither read nor written.');
  else if (written) console.log(`\nBaseline ${written}: ${config.baselineFile}`);
}

export function printSummary(
  summary: Summary,
  config: Config,
  stats: { elapsedMs: number; cacheHits: number; comparisonsWritten: number }
): void {
  const total = summary.totalProcessed;

  console.log(`\nCompleted in ${(stats.elapsedMs / 1000).toFixed(1)}s`);
  console.log(`  mean shape error     ${(summary.meanShapeScore * 100).toFixed(3)}%`);
  console.log(`  worst shape error    ${(summary.worstShapeScore * 100).toFixed(2)}%`);
  console.log(`  mean placement error ${summary.meanPlacementErrorPx.toFixed(3)}px`);
  console.log(`  worst placement err  ${summary.worstPlacementErrorPx.toFixed(3)}px`);
  console.log(`  audit issues         ${summary.auditIssueCount}`);
  console.log(`  failing files        ${summary.failingIcons}/${total}`);
  console.log(
    `  source cache         ${stats.cacheHits}/${total} hit` +
      (config.useCache ? '' : '  (disabled with --no-cache)')
  );
  console.log(
    `  triptychs written    ${stats.comparisonsWritten}/${total}` +
      (config.comparisons === 'scored'
        ? '  (identical pairs skipped; --comparisons=all to force)'
        : '')
  );
}

export function printFeatureWarnings(metrics: IconMetrics[]): void {
  const flagged = metrics.filter(m => m.featureWarnings);
  if (!flagged.length) return;

  console.log(`\nUnsupported/approximated features (${flagged.length} file(s)):`);
  flagged.forEach(m => console.log(`  ${m.id}: ${m.featureWarnings}`));
}

export function printWorst(metrics: IconMetrics[], count = 15): void {
  console.log(`\nWorst ${count} by shape error:`);
  [...metrics]
    .sort((a, b) => (b.shapeScore ?? 0) - (a.shapeScore ?? 0))
    .slice(0, count)
    .forEach(m =>
      console.log(
        `  ${((m.shapeScore ?? 0) * 100).toFixed(2).padStart(6)}%  ${m.id}` +
          (m.auditIssues.length ? `  (${m.auditIssues.length} audit issue(s))` : '')
      )
    );
}

export function printCorpusIssues(issues: string[]): void {
  if (!issues.length) return;
  console.log(`\nPackage-level issues (${issues.length}):`);
  [...new Set(issues)].slice(0, 20).forEach(i => console.log(`  ${i}`));
}

export function printGate(gate: GateResult): void {
  if (gate.unbaselined.length) {
    const bySet = new Map<string, number>();
    gate.unbaselined.forEach(id => {
      const set = id.includes('__') ? id.slice(0, id.indexOf('__')) : '(root)';
      bySet.set(set, (bySet.get(set) ?? 0) + 1);
    });

    console.log(`\nNOT GATED - ${gate.unbaselined.length} file(s) have no baseline entry:`);
    [...bySet].forEach(([set, n]) => console.log(`  ${set}  ${n} file(s)`));
    console.log(
      '  Nothing is checking these, so the run fails. Read the scores above,\n' +
        '  then re-run with --update-baseline to accept them.'
    );
  }

  if (gate.unexpectedPasses.length) {
    console.log(`\nNOW PASSING - ${gate.unexpectedPasses.length} expected failure(s) came good:`);
    gate.unexpectedPasses.forEach(id => console.log(`  ${id}`));
    console.log('  Remove them from the expected-failures file so the gate holds the new limit.');
  }

  if (gate.regressions.length) {
    console.log(`\nREGRESSIONS vs baseline (${gate.regressions.length}):`);
    gate.regressions.forEach(r => console.log(`  ${r}`));
  }

  if (gate.reasons.length) {
    console.log(`\nFAILED (${gate.reasons.length} reason(s)):`);
    gate.reasons.forEach(r => console.log(`  - ${r}`));
  }
}

export function printReport(file: string): void {
  console.log(`\nReport: ${path.relative(process.cwd(), file)}`);
}
