import { optimizeSvgWithSvgo } from './optimize/svgoConfig';
import { flattenStyleCascade } from './optimize/cascade';
import { expandUseElements } from './optimize/useExpand';
import { flattenGradients } from './optimize/gradients';
import { normaliseColors, removeEmptyDefs } from './optimize/cleanup';

/**
 * Flattens gradients, resolves CSS rules, and normalizes colors across SVG
 * string.
 *
 * This runs in Node at build time as well as in the browser - see
 * `vite/icon-sets.ts` - so the markup the site renders and the markup the
 * fidelity harness scores are byte-identical.
 *
 * The individual passes live in `optimize/`. This file owns only the order
 * they run in, which is the part that used to be invisible: the whole thing
 * was one procedure whose only structure was blank lines, and every step
 * mutates the same `doc`.
 */

/** A single mutation over the shared document. */
type Pass = (doc: Document) => void;

/**
 * The passes, in the only order that works.
 *
 * The constraints are not suggestions - each one is a defect that reappears
 * if the pair is swapped.
 */
const PASSES: Pass[] = [
  // FIRST. Every pass below reads presentation attributes; until this has run
  // the real value may still be sitting in a <style> rule or a style=""
  // attribute, where none of them will see it.
  flattenStyleCascade,

  // BEFORE flattenGradients. A <use> can reference a <symbol> in <defs> whose
  // children carry fill="url(#grad)". Flatten first and those references are
  // still inside the unexpanded original, so they get cloned out afterwards
  // pointing at a gradient that has already been deleted.
  expandUseElements,

  // BEFORE normaliseColors, which only understands #rgb, #rrggbb and rgb() -
  // it can do nothing with url(#grad) and would leave it in place.
  // BEFORE removeEmptyDefs, because flattening is what empties the <defs>
  // that pass then collects.
  flattenGradients,

  // LAST writer of fill/stroke, so it sees every colour the passes above
  // produced rather than only the ones that were in the source.
  normaliseColors,

  // LAST. Collects the <defs> that gradient flattening emptied.
  removeEmptyDefs,
];

/*
 * NOT passes, deliberately. Both of these existed and were removed; the
 * reasoning is kept here because "why is there no mask pass?" is the obvious
 * question and the wrong answer costs real artwork.
 *
 *  - masks: left intact for the generator. The old pass either dropped the
 *    mask outright (for a <g>) or replaced the masked element with the mask's
 *    own shapes recoloured - both of which paint something the source never
 *    showed.
 *
 *  - clip paths: also left intact for the generator, which has the transform
 *    stack and the polygon boolean engine needed to apply them properly. The
 *    old pass replaced a clipped group with the *clipping shape itself*
 *    whenever that shape was smaller than 20x20 - so `Kuberun.svg`, whose
 *    19.97x16.09 clip rect is a no-op export artefact, rendered as a solid
 *    blue rectangle instead of a wheel.
 */

export function optimizeSvgString(rawSvg: string): string {
  if (!rawSvg) return '';

  const svgoCleaned = optimizeSvgWithSvgo(rawSvg);

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgoCleaned, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return svgoCleaned;

    for (const pass of PASSES) pass(doc);

    return new XMLSerializer().serializeToString(doc);
  } catch (err) {
    console.error('SVG Optimizer error:', err);
    return svgoCleaned;
  }
}
