import { describe, expect, it } from 'vitest';
import { categorizeByRules, expandSynonyms, formatTitle } from './categorizer';

const CATEGORIES = [
  { id: 'compute', name: 'Compute' },
  { id: 'general', name: 'General' },
];

describe('categorizeByRules', () => {
  const rules = [
    { category: 'compute', match: ['run', 'gke'] },
    { category: 'general', match: ['misc'] },
  ];

  it('matches a keyword anywhere in the name', () => {
    expect(categorizeByRules('Cloud-Run', rules, CATEGORIES)).toBe('compute');
  });

  it('ignores case', () => {
    expect(categorizeByRules('CLOUD-GKE', rules, CATEGORIES)).toBe('compute');
  });

  // The rules are ordered and first-wins, which is what lets an author put a
  // narrow rule above a broad one.
  it('takes the first matching rule, not the best one', () => {
    const ordered = [
      { category: 'compute', match: ['cloud'] },
      { category: 'general', match: ['cloud-storage'] },
    ];
    expect(categorizeByRules('Cloud-Storage', ordered, CATEGORIES)).toBe('compute');
  });

  it('falls through to the last category, so the catch-all goes last', () => {
    expect(categorizeByRules('Nothing-Matches', rules, CATEGORIES)).toBe('general');
  });
});

describe('expandSynonyms', () => {
  const groups = [['vpc', 'virtual private cloud']];

  it('works in both directions from one declaration', () => {
    expect(expandSynonyms(['Virtual Private Cloud'], groups)).toContain('vpc');
    expect(expandSynonyms(['VPC'], groups)).toContain('virtual private cloud');
  });

  it('matches whole words only, so "ids" does not match "idsomething"', () => {
    expect(expandSynonyms(['Bigquery'], [['ids', 'intrusion detection']])).toEqual([]);
  });

  it('returns nothing when there are no groups', () => {
    expect(expandSynonyms(['Anything'], undefined)).toEqual([]);
  });
});

describe('formatTitle', () => {
  it('turns a filename into words', () => {
    expect(formatTitle('cloud-run')).toBe('Cloud Run');
    expect(formatTitle('cloud_run')).toBe('Cloud Run');
  });

  it('keeps known acronyms uppercase', () => {
    expect(formatTitle('gke-on-prem')).toBe('GKE On Prem');
  });

  it('reads a double dash as a real dash', () => {
    expect(formatTitle('ai--machine-learning')).toBe('AI - Machine Learning');
  });
});
