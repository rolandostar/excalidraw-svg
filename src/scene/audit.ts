/**
 * Static analysis of a generated scene against the rules Excalidraw applies at
 * render time.
 *
 * Catches "looks right in the source SVG, disappears in Excalidraw"
 * regressions without a manual review of 216 images.
 *
 * This lives in `src/` rather than `scripts/` because it is pure and both
 * callers need it: the harness asserts on it across 216 icons and four export
 * paths, and the browser runs it on an uploaded file so the user is told what
 * will go missing *before* they paste.
 */
import type { ExcalidrawElement, ExcalidrawFile } from '../types/excalidraw';
import { LINE_CONFIRM_THRESHOLD } from './options';

export interface FidelityIssue {
  elementIndex: number;
  elementType: string;
  kind: 'unfilled-open-path' | 'degenerate' | 'missing-file' | 'invisible-fill';
  detail: string;
}

/** Rough.js fill styles that draw strokes *of the background colour*. */
const HATCHED_FILL_STYLES = new Set(['hachure', 'cross-hatch', 'zigzag', 'dots', 'dashed']);

export function auditSceneFidelity(
  elements: ExcalidrawElement[],
  files: Record<string, ExcalidrawFile> = {}
): FidelityIssue[] {
  const issues: FidelityIssue[] = [];

  elements.forEach((el, elementIndex) => {
    if (el.isDeleted) return;

    if (el.type === 'line') {
      const points = el.points || [];
      const hasFill = !!el.backgroundColor && el.backgroundColor !== 'transparent';

      if (points.length < 2) {
        issues.push({
          elementIndex,
          elementType: el.type,
          kind: 'degenerate',
          detail: `line has ${points.length} point(s); Excalidraw renders nothing`,
        });
        return;
      }

      if (hasFill) {
        const first = points[0];
        const last = points[points.length - 1];
        const gap = Math.hypot(first[0] - last[0], first[1] - last[1]);
        if (points.length < 3 || gap > LINE_CONFIRM_THRESHOLD) {
          issues.push({
            elementIndex,
            elementType: el.type,
            kind: 'unfilled-open-path',
            detail:
              `backgroundColor ${el.backgroundColor} will be ignored: path is not a loop ` +
              `(first/last gap ${gap.toFixed(2)} > LINE_CONFIRM_THRESHOLD ${LINE_CONFIRM_THRESHOLD})`,
          });
        }
      }
    }

    /*
     * A hatched fill is drawn by stroking lines *in the background colour*
     * across the shape, so `backgroundColor: 'transparent'` produces nothing
     * at all - not a faint fill, not a solid one. Nothing errors and the
     * element still renders its outline, so the fill style silently has no
     * effect.
     *
     * Every "Sketch" preset this project shipped paired `hachure` with a
     * transparent background, in all three icon sets, and none of them had
     * ever drawn a hatch. `normaliseOptions` now repairs the pairing; this
     * catches it anywhere else it appears.
     */
    if (
      HATCHED_FILL_STYLES.has(el.fillStyle) &&
      (!el.backgroundColor || el.backgroundColor === 'transparent')
    ) {
      issues.push({
        elementIndex,
        elementType: el.type,
        kind: 'invisible-fill',
        detail:
          `fillStyle "${el.fillStyle}" draws in the background colour, which is ` +
          `transparent: the fill will not be visible`,
      });
    }

    if ((el.type === 'ellipse' || el.type === 'rectangle') && (el.width <= 0 || el.height <= 0)) {
      issues.push({
        elementIndex,
        elementType: el.type,
        kind: 'degenerate',
        detail: `zero-sized ${el.type} (${el.width}x${el.height})`,
      });
    }

    if (el.type === 'image' && (!el.fileId || !files[el.fileId])) {
      issues.push({
        elementIndex,
        elementType: el.type,
        kind: 'missing-file',
        detail: `image element references fileId "${el.fileId}" which is not in files{}`,
      });
    }
  });

  return issues;
}
