import { describe, expect, it } from 'vitest';
import { auditSceneFidelity } from './audit';
import type { ExcalidrawElement } from '../types/excalidraw';

/** A closed square, which is the shape every case below starts from. */
const square = (overrides: Partial<ExcalidrawElement> = {}): ExcalidrawElement =>
  ({
    type: 'line',
    points: [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
    backgroundColor: '#4285f4',
    fillStyle: 'solid',
    ...overrides,
  }) as ExcalidrawElement;

const kinds = (el: ExcalidrawElement, files = {}) =>
  auditSceneFidelity([el], files).map(i => i.kind);

describe('auditSceneFidelity', () => {
  it('passes a closed, filled loop', () => {
    expect(kinds(square())).toEqual([]);
  });

  it('flags a line with fewer than two points', () => {
    expect(kinds(square({ points: [[0, 0]] }))).toEqual(['degenerate']);
  });

  it('flags a filled path whose ends do not meet', () => {
    const open = square({
      points: [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
    });
    expect(kinds(open)).toEqual(['unfilled-open-path']);
  });

  // A gap under LINE_CONFIRM_THRESHOLD (8) is closed by Excalidraw itself.
  it('accepts a small gap, because Excalidraw closes it', () => {
    const nearlyClosed = square({
      points: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [1, 1],
      ],
    });
    expect(kinds(nearlyClosed)).toEqual([]);
  });

  it('ignores an open path with no fill', () => {
    const open = square({
      points: [
        [0, 0],
        [10, 0],
      ],
      backgroundColor: 'transparent',
    });
    expect(kinds(open)).toEqual([]);
  });

  it('skips deleted elements', () => {
    expect(kinds(square({ points: [[0, 0]], isDeleted: true }))).toEqual([]);
  });

  it('flags an image pointing at a file that is not there', () => {
    const image = { type: 'image', fileId: 'missing' } as unknown as ExcalidrawElement;
    expect(kinds(image)).toEqual(['missing-file']);
    expect(kinds(image, { missing: { dataURL: 'data:image/png;base64,x' } })).toEqual([]);
  });
});
