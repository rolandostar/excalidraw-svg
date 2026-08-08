import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { collectSvgFiles } from './corpus';
import baseline from '../../tests/baselines/icons.json';
import headline from '../../src/generated/evidence-headline.json';

const SVG_ROOT = path.resolve(process.cwd(), 'svg');

const collected = collectSvgFiles(SVG_ROOT);

const svgsIn = (dir: string) => fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.svg'));

const setDirs = fs
  .readdirSync(SVG_ROOT, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

/**
 * The corpus is whatever is in `svg/`, and three things have to agree about
 * it: the harness, the baseline and the numbers on the website.
 *
 * They can drift apart silently. A new set folder is picked up by the site the
 * moment it exists, but the baseline only learns about it when somebody runs
 * `--update-baseline`, and the website's headline figures only change when
 * somebody runs `pnpm evidence`. Each of those is a separate manual step, so
 * this suite makes the mismatch loud in three seconds instead of leaving a
 * whole set untested behind a green build.
 */
describe('the corpus', () => {
  it('has at least one set', () => {
    expect(setDirs.length).toBeGreaterThan(0);
  });

  it('collects every SVG in every set folder', () => {
    const onDisk = setDirs.reduce((n, d) => n + svgsIn(path.join(SVG_ROOT, d)).length, 0);
    expect(collected.length).toBe(onDisk);
  });

  it('covers every set, not just the biggest one', () => {
    const covered = new Set(collected.map(c => c.setId));
    expect([...covered].sort()).toEqual([...setDirs].sort());
  });

  // A loose file is silently skipped by both the harness and the site, so it
  // would be shipped untested and uncounted.
  it('has no SVG sitting loose in svg/', () => {
    expect(svgsIn(SVG_ROOT)).toEqual([]);
  });

  it('gives every file a unique id', () => {
    expect(new Set(collected.map(c => c.id)).size).toBe(collected.length);
  });
});

describe('the baseline', () => {
  const baselined = new Set(Object.keys(baseline));

  it('covers every file in the corpus', () => {
    const missing = collected.filter(c => !baselined.has(c.id)).map(c => c.id);
    expect(missing).toEqual([]);
  });

  it('has no entry for a file that is gone', () => {
    const ids = new Set(collected.map(c => c.id));
    expect([...baselined].filter(id => !ids.has(id))).toEqual([]);
  });
});

describe('the numbers the website quotes', () => {
  it('count the whole corpus, not a subset', () => {
    expect(headline.icons.total).toBe(collected.length);
  });
});
