/**
 * Owns the one pass that implements a piece of CSS: resolving `<style>` rules
 * onto elements as presentation attributes.
 *
 * Separate because it is the only pass whose correctness is defined by a spec
 * outside this codebase, and because the property list it maintains is a
 * contract with the Excalidraw generator - the generator reads those exact
 * attributes back off the element, so adding to the list here is how a new
 * property becomes visible downstream.
 */

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
export function flattenStyleCascade(doc: Document): void {
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
