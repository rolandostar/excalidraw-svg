/**
 * Owns `<use>` expansion: replacing each reference with a real copy of its
 * target, wrapped so that inheritance still works.
 *
 * Separate because the three comments below are each a bug that shipped. The
 * pass is short but every line of it is a correction, and inlining it back
 * into the pipeline is how those corrections got hard to see.
 */

/** Expands every `<use>` into a wrapped clone of its referenced element. */
export function expandUseElements(doc: Document): void {
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
