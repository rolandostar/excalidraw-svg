import { describe, expect, it } from 'vitest';
import { plural } from './ui';

describe('plural', () => {
  it('drops the suffix for exactly one', () => {
    expect(plural(1, 'icon')).toBe('1 icon');
  });

  it('adds an s for anything else, including zero', () => {
    expect(plural(0, 'icon')).toBe('0 icons');
    expect(plural(2, 'icon')).toBe('2 icons');
  });

  it('takes an irregular plural', () => {
    expect(plural(2, 'entry', 'entries')).toBe('2 entries');
  });
});
