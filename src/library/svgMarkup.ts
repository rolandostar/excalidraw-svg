import { Config, optimize } from 'svgo/browser';
import { averageHexColors, parseHexColor } from '../convert/color';

/**
 * The build-time SVG optimiser.
 *
 * Node only: it pulls in SVGO, and importing it from anything the browser
 * loads puts 550 kB in the entry chunk. The two callers are
 * `vite/icon-sets.ts` and the fidelity harness, which is what makes the
 * markup the site renders and the markup the harness scores byte-identical.
 *
 * Each pass mutates one shared `Document`. `PASSES`, near the bottom, owns
 * the order, which is the load-bearing part.
 */

// ---------------------------------------------------------------------------
// Pass: flatten the style cascade
// ---------------------------------------------------------------------------

/** Resolves `<style>` rules onto elements as presentation attributes. */

/**
 * Presentation properties that affect how a shape is drawn and that the
 * Excalidraw generator later reads back off the element.
 *
 * `fill-rule` and `clip-rule` are the important recent additions: they decide
 * which parts of a compound path are holes. Dropping them (as this module used
 * to) makes every donut a guess.
 */
const CASCADED_PROPERTIES = [
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-opacity',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'opacity',
  'clip-path',
  'clip-rule',
  'mask',
  // `filter` is carried purely so the generator can recognise the
  // flood-white "luminosity mask" idiom that design tools emit; no filter is
  // ever actually applied.
  'filter',
  'display',
  'visibility',
] as const;

type CascadedProperty = (typeof CASCADED_PROPERTIES)[number];
type Declarations = Partial<Record<CascadedProperty, string>>;

/** Parses `fill:red;stroke:none` into a declaration bag, ignoring anything we don't model. */
function parseDeclarations(text: string): Declarations {
  const out: Declarations = {};
  for (const chunk of text.split(';')) {
    const idx = chunk.indexOf(':');
    if (idx < 0) continue;
    const prop = chunk.slice(0, idx).trim().toLowerCase() as CascadedProperty;
    if (!CASCADED_PROPERTIES.includes(prop)) continue;
    const value = chunk.slice(idx + 1).replace(/!important/i, '').trim();
    if (value) out[prop] = value;
  }
  return out;
}

/**
 * Resolves `<style>` rules onto elements as presentation attributes, honouring
 * the real CSS cascade:
 *
 *     presentation attribute  <  stylesheet rule  <  inline style attribute
 *
 * The previous implementation had this exactly backwards - it only applied a
 * stylesheet rule when the element had no matching attribute - so an inherited
 * or author-supplied `fill=` silently beat the class that was meant to override
 * it.
 */
function flattenStyleCascade(doc: Document): void {
  const classRules: Record<string, Declarations> = {};

  doc.querySelectorAll('style').forEach(styleEl => {
    const text = (styleEl.textContent || '').replace(/\/\*[\s\S]*?\*\//g, '');
    const blocks = text.match(/([^{}]+)\{([^{}]*)\}/g) || [];

    blocks.forEach(block => {
      const brace = block.indexOf('{');
      if (brace < 0) return;
      const declarations = parseDeclarations(block.slice(brace + 1).replace(/\}$/, ''));
      if (Object.keys(declarations).length === 0) return;

      block
        .slice(0, brace)
        .split(',')
        .map(s => s.trim())
        .forEach(selector => {
          // Only simple class selectors are modelled. Anything else (tag,
          // id, descendant, pseudo) is left alone rather than being wrongly
          // applied to every element that happens to share the name.
          if (!/^\.[-\w]+$/.test(selector)) return;
          const name = selector.slice(1);
          classRules[name] = { ...classRules[name], ...declarations };
        });
    });

    styleEl.parentNode?.removeChild(styleEl);
  });

  doc.querySelectorAll('*').forEach(el => {
    const className = el.getAttribute('class');
    const inlineStyle = el.getAttribute('style');
    if (!className && !inlineStyle) return;

    let resolved: Declarations = {};

    if (className) {
      for (const name of className.split(/\s+/)) {
        if (classRules[name]) resolved = { ...resolved, ...classRules[name] };
      }
    }

    if (inlineStyle) {
      resolved = { ...resolved, ...parseDeclarations(inlineStyle) };
    }

    for (const [prop, value] of Object.entries(resolved)) {
      if (value) el.setAttribute(prop, value);
    }

    el.removeAttribute('class');
    if (inlineStyle) el.removeAttribute('style');
  });
}

/**
 * Owns gradient flattening: every `<linearGradient>`/`<radialGradient>` is
 * replaced by the average of its stops, and every reference to it is rewritten
 * to that flat colour.
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

// ---------------------------------------------------------------------------
// Pass: flatten gradients
// ---------------------------------------------------------------------------

/** Replaces every gradient with the average of its stops, then removes it. */
function flattenGradients(doc: Document): void {
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

// ---------------------------------------------------------------------------
// Passes: <use> expansion, colour normalisation, empty <defs>
// ---------------------------------------------------------------------------

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
