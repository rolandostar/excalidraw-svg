/**
 * Conversion fidelity harness - entry point.
 *
 * `./setupDom` MUST stay the first import in this file. ES module dependencies
 * are evaluated in declaration order, and everything below eventually reaches
 * `@excalidraw/utils`, which reads `document` and friends the moment it is
 * evaluated. Move this line and the run dies with "document is not defined".
 *
 * `--help` prints what the harness does and every flag it takes.
 */
import './setupDom';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pruneCache } from './lib/sourceCache';
import { buildHtmlReport ,
  applyGate,
  corpusIssues,
  readBaseline,
  readExpectedFailures,
  summarise,
} from './fidelity/report';
import * as say from './fidelity/console';
import { Config, parseConfig } from './fidelity/config';
import { collectSvgFiles } from './fidelity/corpus';
import { plannedJobs, runWorker, scoreAll } from './fidelity/pool';
import { CACHE_VERSION } from './fidelity/score';

/**
 * Wipes the triptych directory before recreating it.
 *
 * Nothing else prunes it, and `build-evidence.ts` publishes out of it, so a
 * renamed or deleted fixture would otherwise keep shipping its stale PNG
 * forever. Skipped for a worker (its parent already did it, and racing on the
 * directory a sibling is writing into would be fatal) and for `--only`, which
 * scores a subset and must not delete the images it did not regenerate.
 */
function ensureDirs(config: Config) {
  if (!config.workerOut && !config.only) {
    fs.rmSync(config.comparisonsDir, { recursive: true, force: true });
  }
  for (const dir of [config.resultsDir, config.comparisonsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function run() {
  const config = parseConfig();

  if (config.help) return say.printHelp();

  ensureDirs(config);

  // A worker is handed its slice explicitly and must not re-walk the corpus.
  if (config.workerOut) return runWorker(config, config.workerOut);

  let files = collectSvgFiles(config.inputDir);
  if (config.only) files = files.filter(f => f.id.toLowerCase().includes(config.only!));

  const setIds = [...new Set(files.map(f => f.setId))];
  say.printStart(config, files.length, setIds, plannedJobs(config, files.length));

  const baseline = readBaseline(config);
  // Entries from an older measurement version can never be used again.
  if (config.useCache) pruneCache(CACHE_VERSION);

  const startedAt = Date.now();
  const scored = await scoreAll(files, config, fileURLToPath(import.meta.url));

  const issues = corpusIssues(scored);
  const summary = summarise(
    scored.map(s => s.record),
    issues
  );

  const reportFile = path.join(config.resultsDir, 'comparison.html');
  fs.writeFileSync(path.join(config.resultsDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
  fs.writeFileSync(reportFile, buildHtmlReport(summary, baseline), 'utf-8');

  const gate = applyGate(config, summary, baseline, readExpectedFailures(config));

  say.printBaselineNotice(config, gate.baselineWritten);
  say.printSummary(summary, config, {
    elapsedMs: Date.now() - startedAt,
    cacheHits: scored.filter(s => s.cacheHit).length,
    comparisonsWritten: scored.filter(s => s.wroteComparison).length,
  });
  say.printFeatureWarnings(summary.icons);
  say.printWorst(summary.icons);
  say.printCorpusIssues(issues);
  say.printReport(reportFile);
  say.printGate(gate);

  if (gate.reasons.length) process.exitCode = 1;
}

run().catch(err => {
  console.error('Harness failed:', err);
  process.exit(1);
});
