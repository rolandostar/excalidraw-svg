import { describe, expect, it, vi } from 'vitest';
import { sanitizeOptionsPatch } from './options';
import { GCP_BLUE } from '../types/options';

/** Every rejection warns, and the warning is the whole point of rejecting. */
const sanitize = (raw: unknown) => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const out = sanitizeOptionsPatch(raw, 'test');
  const warnings = warn.mock.calls.map(c => String(c[0]));
  warn.mockRestore();
  return { out, warnings };
};

describe('sanitizeOptionsPatch', () => {
  it('keeps a valid patch', () => {
    expect(sanitize({ showCard: true, cardCorners: 'square' }).out).toEqual({
      showCard: true,
      cardCorners: 'square',
    });
  });

  it('drops a key it does not recognise, and says so', () => {
    const { out, warnings } = sanitize({ nonsense: 1 });
    expect(out).toEqual({});
    expect(warnings.join(' ')).toContain('nonsense');
  });

  // Merging a value no control can represent leaves the UI unable to show it
  // or undo it, which is worse than ignoring the value.
  it('drops a value outside the allowed set', () => {
    expect(sanitize({ cardCorners: 'circular' }).out).toEqual({});
  });

  it('drops a value of the wrong type', () => {
    expect(sanitize({ showCard: 'yes' }).out).toEqual({});
  });

  it('names the replacement for a retired key', () => {
    const { warnings } = sanitize({ cardStyle: 'sketch-box' });
    expect(warnings.join(' ')).toMatch(/cardStyle/);
  });

  it('accepts colours in the formats the pickers produce', () => {
    for (const cardBgColor of ['#fff', '#4285f4', 'transparent']) {
      expect(sanitize({ cardBgColor }).out).toEqual({ cardBgColor });
    }
  });

  it('rejects a string that is not a colour', () => {
    expect(sanitize({ cardBgColor: 'blueish' }).out).toEqual({});
  });

  /**
   * Presets are matched by `sameOptions`, a `===` over the fields, so a
   * manifest declaring `#4285F4` has to arrive as the same string the
   * defaults and the palettes use or it can never match its own preset.
   */
  it('lowercases colours so preset matching can use ===', () => {
    expect(sanitize({ cardStrokeColor: '  #4285F4 ' }).out).toEqual({
      cardStrokeColor: GCP_BLUE,
    });
    expect(sanitize({ cardBgColor: 'RGBA(30, 41, 59, 0.8)' }).out).toEqual({
      cardBgColor: 'rgba(30, 41, 59, 0.8)',
    });
  });

  it('returns an empty patch for a non-object', () => {
    expect(sanitize(null).out).toEqual({});
    expect(sanitize('nope').out).toEqual({});
  });
});
