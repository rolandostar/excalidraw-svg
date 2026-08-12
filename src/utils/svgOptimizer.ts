/**
 * Flattens gradients, resolves CSS rules and normalises colours across an SVG
 * string.
 *
 * Runs in Node at build time as well as in the browser - see
 * `vite/icon-sets.ts` - so the markup the site renders and the markup the
 * fidelity harness scores are byte-identical.
 *
 * Each pass is a mutation over one shared `Document`. The order below is the
 * load-bearing part; the two larger passes, `flattenStyleCascade` and
 * `flattenGradients`, live in `optimize/` because they are substantial enough
 * to read on their own.
 */
import { Config, optimize } from 'svgo/browser';
import { parseHexColor } from './color';
import { flattenStyleCascade } from './optimize/cascade';
import { flattenGradients } from './optimize/gradients';

type Pass = (doc: Document) => void;

/**
 * Replaces every `<use>` with a wrapped clone of its target.
 *
 * Each of the three comments below is a defect that shipped.
 */
function expandUseElements(doc: Document): void {
  doc.querySelectorAll('use').forEach(useEl => {
    const href = useEl.getAttribute('href') || useEl.getAttribute('xlink:href');
    if (!href || !href.startsWith('#')) return;
    const target = doc.querySelector(`[id="${href.substring(1)}"]`);
    if (!target || target.contains(useEl)) return;

    const clone = target.cloneNode(true) as Element;
    clone.removeAttribute('id');

    // `x`/`y` on a <use> are a translation, not attributes to copy onto the
    // clone - `<g x="6">` means nothing, so copying them stacked every
    // instance at the origin. They also apply *after* the use's own
    // transform, and before the referenced element's.
    const x = parseFloat(useEl.getAttribute('x') || '0') || 0;
    const y = parseFloat(useEl.getAttribute('y') || '0') || 0;
    const transform = [useEl.getAttribute('transform') || '', x || y ? `translate(${x} ${y})` : '']
      .filter(Boolean)
      .join(' ');

    // A <use> is the inheritance parent of its expansion, so presentation
    // attributes go on a wrapper rather than overwriting the clone's own.
    const wrapper = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
    if (transform) wrapper.setAttribute('transform', transform);
    for (const attr of ['fill', 'stroke', 'opacity', 'fill-opacity', 'stroke-opacity', 'stroke-width']) {
      const value = useEl.getAttribute(attr);
      if (value) wrapper.setAttribute(attr, value);
    }

    // A referenced <symbol> is not rendered itself; its children are.
    if (clone.tagName.toLowerCase() === 'symbol') {
      while (clone.firstChild) wrapper.appendChild(clone.firstChild);
    } else {
      wrapper.appendChild(clone);
    }

    useEl.parentNode?.replaceChild(wrapper, useEl);
  });
}

/** Rewrites every `fill`/`stroke` that parses into canonical hex. */
function normaliseColors(doc: Document): void {
  doc.querySelectorAll('*').forEach(el => {
    for (const attr of ['fill', 'stroke']) {
      const value = el.getAttribute(attr);
      if (!value || value === 'none') continue;
      const hex = parseHexColor(value);
      if (hex) el.setAttribute(attr, hex);
    }
  });
}

/** Drops a `<defs>` that earlier passes emptied out. */
function removeEmptyDefs(doc: Document): void {
  doc.querySelectorAll('defs').forEach(defs => {
    if (defs.children.length === 0) defs.parentNode?.removeChild(defs);
  });
}

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

/**
 * The SVGO config, and the four plugin overrides and one omission that make
 * it safe to run before the passes above. Every one is load-bearing: turn any
 * of them back on and a later pass loses information it cannot recover.
 */
const SVGO_CONFIG: Config = {
  multipass: true,
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          cleanupIds: false,
          convertPathData: false,
          removeUselessStrokeAndFill: false,
          removeUnknownsAndDefaults: false,
        },
      },
    },
    // NOTE: `convertStyleToAttrs` is deliberately NOT enabled. It collapses
    // `style="fill:red"` into `fill="red"`, which erases the difference
    // between an inline style (highest priority in the CSS cascade) and a
    // presentation attribute (lowest). `flattenStyleCascade` needs that
    // distinction to resolve stylesheet rules correctly.
    'removeDimensions',
  ],
};

function runSvgo(rawSvg: string): string {
  if (!rawSvg.trim()) return rawSvg;
  try {
    return optimize(rawSvg, SVGO_CONFIG).data || rawSvg;
  } catch (err) {
    console.warn('SVGO optimization error:', err);
    return rawSvg;
  }
}

export function optimizeSvgString(rawSvg: string): string {
  if (!rawSvg) return '';

  const svgoCleaned = runSvgo(rawSvg);

  try {
    const doc = new DOMParser().parseFromString(svgoCleaned, 'image/svg+xml');
    if (!doc.querySelector('svg')) return svgoCleaned;

    for (const pass of PASSES) pass(doc);

    return new XMLSerializer().serializeToString(doc);
  } catch (err) {
    console.error('SVG Optimizer error:', err);
    return svgoCleaned;
  }
}
