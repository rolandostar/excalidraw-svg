import { parseHexColor } from './color';

/**
 * Owns the two tidying passes that must run last, after every pass that can
 * still write a colour or empty out a `<defs>`.
 *
 * Separate mainly to give that ordering somewhere to be stated. Both passes
 * are trivial; what matters is that neither can be moved earlier, and the
 * `PASSES` array in `svgOptimizer.ts` is where that is enforced.
 */

/** Rewrites every `fill`/`stroke` this module can parse into canonical hex. */
export function normaliseColors(doc: Document): void {
  doc.querySelectorAll('*').forEach(el => {
    const fill = el.getAttribute('fill');
    if (fill && fill !== 'none') {
      const hex = parseHexColor(fill);
      if (hex) el.setAttribute('fill', hex);
    }
    const stroke = el.getAttribute('stroke');
    if (stroke && stroke !== 'none') {
      const hex = parseHexColor(stroke);
      if (hex) el.setAttribute('stroke', hex);
    }
  });
}

/** Drops a `<defs>` that earlier passes emptied out. */
export function removeEmptyDefs(doc: Document): void {
  doc.querySelectorAll('defs').forEach(defs => {
    if (defs.children.length === 0) defs.parentNode?.removeChild(defs);
  });
}
