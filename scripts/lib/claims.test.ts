import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  CLAIMS_END,
  CLAIMS_START,
  readIconCounts,
  renderClaimsBlock,
  writeClaimsBlock,
  writeIconCount,
} from './claims';
import headline from '../../src/generated/evidence-headline.json';
import type { EvidenceHeadline } from '../build-evidence';

const README = fs.readFileSync(path.resolve(process.cwd(), 'README.md'), 'utf-8');
const INDEX_HTML = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
const current = headline as EvidenceHeadline;

/**
 * The README quotes figures that also live in the generated evidence. Either
 * they are written from one source or they drift - and they did: the table sat
 * at a stale mean for two changes, and the perfect-icon count was wrong by two
 * because it had been derived from how many images got published.
 */
describe('README fidelity claims', () => {
  it('match the generated evidence exactly', () => {
    const start = README.indexOf(CLAIMS_START);
    const end = README.indexOf(CLAIMS_END);
    expect(start, 'claims:start marker missing from README').toBeGreaterThan(-1);

    const committed = README.slice(start, end + CLAIMS_END.length);
    expect(committed).toBe(renderClaimsBlock(current));
  });

  it('quote the perfect count from scores, not from published images', () => {
    expect(current.icons.perfect + current.icons.imperfect).toBe(current.icons.total);
  });

  it('account for every icon in the per-set breakdown', () => {
    const summed = current.icons.sets.reduce((n, s) => n + s.count, 0);
    expect(summed).toBe(current.icons.total);
  });
});

describe('index.html corpus size', () => {
  it('quotes the generated icon total', () => {
    const counts = readIconCounts(INDEX_HTML);
    expect(counts.length, 'index.html no longer quotes an icon count').toBeGreaterThan(0);
    for (const n of counts) expect(n).toBe(current.icons.total);
  });

  it('refuses to guess when the phrase is gone', () => {
    expect(() => writeIconCount('<meta content="nothing here" />', 261)).toThrow(/index\.html/);
  });
});

describe('writeClaimsBlock', () => {
  it('replaces only the marked region', () => {
    const doc = `before\n${CLAIMS_START}\nold\n${CLAIMS_END}\nafter`;
    expect(writeClaimsBlock(doc, `${CLAIMS_START}\nnew\n${CLAIMS_END}`)).toBe(
      `before\n${CLAIMS_START}\nnew\n${CLAIMS_END}\nafter`
    );
  });

  it('refuses to guess when the markers are gone', () => {
    expect(() => writeClaimsBlock('no markers here', 'x')).toThrow(/markers/);
  });
});
