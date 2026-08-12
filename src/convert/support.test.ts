// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { collectUnsupportedFeatures, describeWarnings, listSupportRules } from './support';

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`;
const features = (body: string) => collectUnsupportedFeatures(svg(body)).map(w => w.feature);

/**
 * This is the promise the site makes: nothing is dropped silently. The
 * methodology page builds its support table from `listSupportRules`, so the
 * table and the detection cannot disagree.
 */
describe('collectUnsupportedFeatures', () => {
  it('reports nothing for plain geometry', () => {
    expect(features('<rect width="10" height="10"/>')).toEqual([]);
  });

  it('reports text, which is never converted', () => {
    expect(features('<text x="0" y="0">hi</text>')).toContain('<text>');
  });

  it('reports a raster image', () => {
    expect(features('<image href="a.png" width="4" height="4"/>')).toContain('<image>');
  });

  it('reports a gradient as approximated, not dropped', () => {
    const warnings = collectUnsupportedFeatures(
      svg('<defs><linearGradient id="g"/></defs><rect fill="url(#g)" width="4" height="4"/>')
    );
    expect(warnings.find(w => w.feature.includes('gradient'))?.severity).toBe('approximated');
  });

  it('counts repeats rather than listing them one by one', () => {
    const warnings = collectUnsupportedFeatures(svg('<text>a</text><text>b</text>'));
    expect(warnings.find(w => w.feature === '<text>')?.count).toBe(2);
  });

  it('reports a skew, which the transform maths ignores', () => {
    expect(features('<g transform="skewX(10)"><rect width="4" height="4"/></g>').join(' ')).toContain(
      'skew'
    );
  });
});

describe('listSupportRules', () => {
  it('splits into things dropped and things approximated', () => {
    const rules = listSupportRules();
    expect(rules.some(r => r.severity === 'unsupported')).toBe(true);
    expect(rules.some(r => r.severity === 'approximated')).toBe(true);
  });

  it('gives every rule a detail, because the table shows it', () => {
    expect(listSupportRules().every(r => r.detail.length > 0)).toBe(true);
  });
});

describe('describeWarnings', () => {
  it('says so explicitly when there is nothing to report', () => {
    expect(describeWarnings([])).toMatch(/no unsupported features/i);
  });

  it('lists the feature and its count', () => {
    const summary = describeWarnings(collectUnsupportedFeatures(svg('<text>a</text><text>b</text>')));
    expect(summary).toContain('<text>');
    expect(summary).toContain('2');
  });
});
