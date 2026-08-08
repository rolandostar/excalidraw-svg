import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS, isFailing } from './thresholds';
import type { IconMetrics } from './thresholds';

const icon = (patch: Partial<IconMetrics> = {}): IconMetrics =>
  ({
    id: 'set__Icon',
    title: 'Icon',
    shapeScore: 0,
    placementErrorPx: 0,
    elementCount: 1,
    auditIssues: [],
    ...patch,
  }) as IconMetrics;

const fails = (patch: Partial<IconMetrics>) => isFailing(icon(patch), DEFAULT_THRESHOLDS);

describe('isFailing', () => {
  it('passes a clean icon', () => {
    expect(fails({})).toBe(false);
  });

  it('fails on shape error over the threshold', () => {
    expect(fails({ shapeScore: DEFAULT_THRESHOLDS.shapeScore + 0.001 })).toBe(true);
    expect(fails({ shapeScore: DEFAULT_THRESHOLDS.shapeScore })).toBe(false);
  });

  it('fails on placement error over the threshold', () => {
    expect(fails({ placementErrorPx: DEFAULT_THRESHOLDS.placementErrorPx + 0.001 })).toBe(true);
  });

  it('fails on any audit issue, whatever the score', () => {
    expect(fails({ auditIssues: ['degenerate line'] })).toBe(true);
  });

  it('fails when scoring threw', () => {
    expect(fails({ error: 'boom' })).toBe(true);
  });

  // Nothing measured is not the same as nothing wrong. The baseline only
  // records shape error, so a null must not slip through as a pass.
  it('treats an unmeasured score as the worst case', () => {
    expect(fails({ shapeScore: null })).toBe(true);
    expect(fails({ placementErrorPx: null })).toBe(true);
  });
});
