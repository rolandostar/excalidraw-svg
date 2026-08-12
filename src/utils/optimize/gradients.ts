import { averageHexColors } from '../color';

/**
 * Owns gradient flattening: every `<linearGradient>`/`<radialGradient>` is
 * replaced by the average of its stops, and every reference to it is rewritten
 * to that flat colour.
 *
 * Separate because this is the pass that builds selectors and regular
 * expressions out of author-controlled ids, which is the one place in the
 * optimiser where untrusted text becomes code. Keeping it alone makes the two
 * escapers below impossible to miss.
 */

/**
 * Escapes a value for use inside a double-quoted CSS attribute selector.
 *
 * `id` comes from the file. An id containing `"` used to close the selector
 * string early and make `querySelectorAll` throw, which the caller's catch
 * turned into "skip every remaining pass on this file".
 */
const cssStringLiteral = (value: string): string => value.replace(/["\\]/g, '\\$&');

/**
 * Escapes a value for use inside a `RegExp` source.
 *
 * Same input, different injection: an id containing `.` or `(` was previously
 * compiled as a metacharacter, so it either matched the wrong elements or
 * threw on an unbalanced bracket.
 */
const regExpLiteral = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replaces every gradient with the average of its stops, then removes it. */
export function flattenGradients(doc: Document): void {
  doc.querySelectorAll('linearGradient, radialGradient').forEach(gradEl => {
    const id = gradEl.getAttribute('id');
    if (!id) return;

    const stopColors: string[] = [];
    gradEl.querySelectorAll('stop').forEach(stop => {
      let color = stop.getAttribute('stop-color');
      if (!color) {
        const style = stop.getAttribute('style') || '';
        const match = style.match(/stop-color\s*:\s*([^;}]+)/i);
        if (match) color = match[1].trim();
      }
      if (color) stopColors.push(color);
    });

    const avgColor = averageHexColors(stopColors);

    const selectorId = cssStringLiteral(id);
    const patternId = regExpLiteral(id);

    doc
      .querySelectorAll(
        `[fill*="${selectorId}"], [stroke*="${selectorId}"], [style*="${selectorId}"]`
      )
      .forEach(el => {
        const fill = el.getAttribute('fill');
        if (fill && fill.includes(id)) el.setAttribute('fill', avgColor);
        const stroke = el.getAttribute('stroke');
        if (stroke && stroke.includes(id)) el.setAttribute('stroke', avgColor);
        const style = el.getAttribute('style');
        if (style && style.includes(id)) {
          const updatedStyle = style
            .replace(new RegExp(`fill\\s*:\\s*url\\(#${patternId}\\)`, 'gi'), `fill:${avgColor}`)
            .replace(new RegExp(`stroke\\s*:\\s*url\\(#${patternId}\\)`, 'gi'), `stroke:${avgColor}`);
          el.setAttribute('style', updatedStyle);
        }
      });

    gradEl.parentNode?.removeChild(gradEl);
  });
}
