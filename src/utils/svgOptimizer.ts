import { optimize, Config } from 'svgo/browser';

/**
 * Parses hex or RGB string into uppercase 6-digit hex format (#RRGGBB).
 */
export function parseHexColor(colorStr: string | null): string | null {
  if (!colorStr) return null;
  const cleaned = colorStr.trim();
  if (cleaned.startsWith('#')) {
    let hex = cleaned.substring(1);
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length === 6) return `#${hex.toUpperCase()}`;
  }
  const rgbMatch = cleaned.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10).toString(16).padStart(2, '0');
    const g = parseInt(rgbMatch[2], 10).toString(16).padStart(2, '0');
    const b = parseInt(rgbMatch[3], 10).toString(16).padStart(2, '0');
    return `#${(r + g + b).toUpperCase()}`;
  }
  return null;
}

/**
 * Computes average solid hex color from a list of color strings.
 */
export function averageHexColors(colors: string[]): string {
  if (!colors || colors.length === 0) return '#4285F4';
  let totalR = 0, totalG = 0, totalB = 0, count = 0;

  colors.forEach(c => {
    const hex = parseHexColor(c);
    if (hex) {
      const raw = hex.substring(1);
      totalR += parseInt(raw.substring(0, 2), 16);
      totalG += parseInt(raw.substring(2, 4), 16);
      totalB += parseInt(raw.substring(4, 6), 16);
      count++;
    }
  });

  if (count === 0) return '#4285F4';
  const avgR = Math.round(totalR / count).toString(16).padStart(2, '0');
  const avgG = Math.round(totalG / count).toString(16).padStart(2, '0');
  const avgB = Math.round(totalB / count).toString(16).padStart(2, '0');
  return `#${(avgR + avgG + avgB).toUpperCase()}`;
}

/**
 * Runs SVGO on raw SVG string to optimize path commands, remove metadata, doctypes, comments, etc.
 */
export function optimizeSvgWithSvgo(rawSvg: string, customConfig?: Config): string {
  if (!rawSvg || !rawSvg.trim()) return rawSvg;

  try {
    const config: Config = customConfig || {
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
        // presentation attribute (lowest). `flattenStyleCascade` below needs
        // that distinction to resolve stylesheet rules correctly.
        'removeDimensions',
      ],
    };

    const result = optimize(rawSvg, config);
    return result.data || rawSvg;
  } catch (err) {
    console.warn('SVGO optimization error:', err);
    return rawSvg;
  }
}

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
 * Flattens gradients, resolves CSS rules, and normalizes colors across SVG string.
 */
export function optimizeSvgString(rawSvg: string): string {
  if (!rawSvg) return '';

  const svgoCleaned = optimizeSvgWithSvgo(rawSvg);

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgoCleaned, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return svgoCleaned;

    flattenStyleCascade(doc);

    // Expand <use> tags
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

    // NOTE: masks, like clip paths, are left intact for the generator. The
    // previous implementation either dropped the mask outright (for a <g>) or
    // replaced the masked element with the mask's own shapes recoloured - both
    // of which paint something the source never showed.

    // NOTE: clip paths are deliberately left intact for the generator, which
    // has the transform stack and the polygon boolean engine needed to apply
    // them properly. The previous implementation replaced a clipped group with
    // the *clipping shape itself* whenever that shape was smaller than 20x20 -
    // so `Kuberun.svg`, whose 19.97x16.09 clip rect is a no-op export
    // artefact, rendered as a solid blue rectangle instead of a wheel.

    // Flatten Gradients
    doc.querySelectorAll('linearGradient, radialGradient').forEach(gradEl => {
      const id = gradEl.getAttribute('id');
      if (!id) return;

      const stopColors: string[] = [];
      gradEl.querySelectorAll('stop').forEach(stop => {
        let color = stop.getAttribute('stop-color');
        if (!color) {
          const style = stop.getAttribute('style') || '';
          const match = style.match(/stop-color\s*:\s*([^;\}]+)/i);
          if (match) color = match[1].trim();
        }
        if (color) stopColors.push(color);
      });

      const avgColor = averageHexColors(stopColors);

      doc.querySelectorAll(`[fill*="${id}"], [stroke*="${id}"], [style*="${id}"]`).forEach(el => {
        const fill = el.getAttribute('fill');
        if (fill && fill.includes(id)) el.setAttribute('fill', avgColor);
        const stroke = el.getAttribute('stroke');
        if (stroke && stroke.includes(id)) el.setAttribute('stroke', avgColor);
        const style = el.getAttribute('style');
        if (style && style.includes(id)) {
          const updatedStyle = style
            .replace(new RegExp(`fill\\s*:\\s*url\\(#${id}\\)`, 'gi'), `fill:${avgColor}`)
            .replace(new RegExp(`stroke\\s*:\\s*url\\(#${id}\\)`, 'gi'), `stroke:${avgColor}`);
          el.setAttribute('style', updatedStyle);
        }
      });

      gradEl.parentNode?.removeChild(gradEl);
    });

    // Normalize color attributes to hex
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

    // Remove empty defs
    doc.querySelectorAll('defs').forEach(defs => {
      if (defs.children.length === 0) defs.parentNode?.removeChild(defs);
    });

    return new XMLSerializer().serializeToString(doc);
  } catch (err) {
    console.error('SVG Optimizer error:', err);
    return svgoCleaned;
  }
}
