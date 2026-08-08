/**
 * Worker fan-out. The only module that knows `fork()` exists.
 *
 * Forking rather than threading because the scoring stack is a jsdom document
 * plus Excalidraw's renderer reading bare globals, and giving each of those a
 * private realm is the whole reason this is safe to parallelise at all. Each
 * file is scored independently, so the only shared state is the output
 * directory, and every file owns a unique filename in it.
 */
import { fork } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Config, WORKER_OUT_ENV, childArgs } from './config';
import { Candidate } from './corpus';
import { ScoredFile, scoreFile } from './score';
import { printProgress } from './console';

/** Round-robin, so a slow run of large files cannot land entirely on one worker. */
function shard<T>(items: T[], buckets: number): T[][] {
  const out: T[][] = Array.from({ length: buckets }, () => []);
  items.forEach((item, i) => out[i % buckets].push(item));
  return out;
}

/**
 * How many workers this run will actually use.
 *
 * Below two files per worker the fork overhead dominates, so the run stays on
 * one process. Exported so the banner cannot claim a fan-out that never happens.
 */
export function plannedJobs(config: Config, fileCount: number): number {
  if (config.jobs <= 1 || fileCount < config.jobs * 2) return 1;
  return Math.min(config.jobs, fileCount);
}

/** Child entry point: score a slice, write it to a file, exit. */
export async function runWorker(config: Config, outFile: string): Promise<void> {
  const slice: Candidate[] = JSON.parse(fs.readFileSync(`${outFile}.in`, 'utf-8'));
  const results: ScoredFile[] = [];

  for (const candidate of slice) {
    results.push(await scoreFile(candidate, config));
    if (process.send) process.send({ done: 1 });
  }

  fs.writeFileSync(outFile, JSON.stringify(results), 'utf-8');
}

/** Scores every file, fanned out across `plannedJobs` child processes. */
export async function scoreAll(
  files: Candidate[],
  config: Config,
  entry: string
): Promise<ScoredFile[]> {
  const jobs = plannedJobs(config, files.length);

  if (jobs === 1) {
    const out: ScoredFile[] = [];
    for (let i = 0; i < files.length; i++) {
      out.push(await scoreFile(files[i], config));
      printProgress(i + 1, files.length);
    }
    return out;
  }

  const shards = shard(files, jobs).filter(s => s.length > 0);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fidelity-'));

  let completed = 0;
  const runs = shards.map(
    (slice, i) =>
      new Promise<ScoredFile[]>((resolve, reject) => {
        const outFile = path.join(tmpDir, `shard-${i}.json`);
        fs.writeFileSync(`${outFile}.in`, JSON.stringify(slice), 'utf-8');

        const child = fork(entry, childArgs(config), {
          stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
          env: { ...process.env, [WORKER_OUT_ENV]: outFile },
        });

        child.on('message', (m: any) => m?.done && printProgress(++completed, files.length));
        child.on('error', reject);
        child.on('exit', code => {
          if (code !== 0) return reject(new Error(`worker ${i} exited with code ${code}`));
          try {
            resolve(JSON.parse(fs.readFileSync(outFile, 'utf-8')));
          } catch (err) {
            reject(err);
          }
        });
      })
  );

  let settled: ScoredFile[][];
  try {
    settled = await Promise.all(runs);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // Re-sorted by id so the report, the summary and the console are ordered
  // identically no matter how the shards happened to finish.
  return settled.flat().sort((a, b) => a.record.id.localeCompare(b.record.id));
}
