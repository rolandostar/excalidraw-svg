import { describe, expect, it } from 'vitest';
import { DEFAULT_EXCALIDRAW_OPTIONS, normaliseOptions } from './defaultOptions';
import type { ExcalidrawOptions } from '../types/options';

const withCard = (patch: Partial<ExcalidrawOptions>): ExcalidrawOptions => ({
  ...DEFAULT_EXCALIDRAW_OPTIONS,
  showCard: true,
  ...patch,
});

/**
 * These three rules are the single source of truth for "the control did
 * nothing". Each one was reported as a bug before it existed, because an
 * invisible result and an ignored setting look identical from the outside.
 */
describe('normaliseOptions', () => {
  it('gives the frame a stroke when both stroke and background are invisible', () => {
    const fixed = normaliseOptions(
      withCard({ cardStrokeColor: 'transparent', cardBgColor: 'transparent' })
    );
    expect(fixed.cardStrokeColor).not.toBe('transparent');
  });

  it('leaves an invisible stroke alone when the background is visible', () => {
    const options = withCard({ cardStrokeColor: 'transparent', cardBgColor: '#4285f4' });
    expect(normaliseOptions(options).cardStrokeColor).toBe('transparent');
  });

  // Rough.js hatches in the background colour, so hachure over a transparent
  // background draws nothing at all. Every shipped Sketch preset had this pair.
  it('forces a solid fill when hachure has no colour to hatch in', () => {
    const fixed = normaliseOptions(withCard({ cardFillStyle: 'hachure', cardBgColor: 'transparent' }));
    expect(fixed.cardFillStyle).toBe('solid');
  });

  it('keeps hachure when the background can carry it', () => {
    const options = withCard({ cardFillStyle: 'hachure', cardBgColor: '#4285f4' });
    expect(normaliseOptions(options).cardFillStyle).toBe('hachure');
  });

  it('ignores an invisible frame that is switched off', () => {
    const off = { ...DEFAULT_EXCALIDRAW_OPTIONS, showCard: false, cardStrokeColor: 'transparent' as const };
    expect(normaliseOptions(off).cardStrokeColor).toBe('transparent');
  });

  it('leaves the shipped defaults untouched', () => {
    expect(normaliseOptions(DEFAULT_EXCALIDRAW_OPTIONS)).toEqual(DEFAULT_EXCALIDRAW_OPTIONS);
  });
});
