/**
 * The one place that answers "how big is this SVG, and in what coordinates".
 *
 * There used to be three: the converter (fallback 24), the upload path
 * (fallback 100) and the icon-set loader (fallback 48, regex-based). They
 * disagreed about more than the fallback - whether a comma-separated viewBox
 * parses, whether a zero extent falls through to `width`/`height` - which is
 * exactly the kind of divergence nobody notices until one file renders at the
 * wrong scale on one page.
 *
 * The fallback stays a caller-supplied argument: 24, 100 and 48 are three
 * genuinely different guesses about three different kinds of input, and
 * collapsing them would change behaviour.
 */

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Where the numbers came from, so a UI can say so honestly. */
  source: 'viewBox' | 'width/height' | 'fallback';
}

/** Size to assume when neither a usable viewBox nor usable dimensions exist. */
export interface ViewBoxFallback {
  width: number;
  height: number;
}

/** The three attributes that can carry an intrinsic size. */
interface SizeAttrs {
  viewBox: string | null;
  width: string | null;
  height: string | null;
}

function parseSizeAttrs(attrs: SizeAttrs, fallback: ViewBoxFallback): ViewBox {
  if (attrs.viewBox) {
    const parts = attrs.viewBox.split(/[\s,]+/).map(Number).filter(n => Number.isFinite(n));
    if (parts.length >= 4 && parts[2] > 0 && parts[3] > 0) {
      return { x: parts[0], y: parts[1], width: parts[2], height: parts[3], source: 'viewBox' };
    }
  }

  // `width`/`height` may carry units (`100mm`, `12em`) or percentages, none of
  // which mean anything without a containing block, so they are only a
  // fallback - and `parseFloat` deliberately keeps the leading number.
  const width = parseFloat(attrs.width ?? '');
  const height = parseFloat(attrs.height ?? '');
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return { x: 0, y: 0, width, height, source: 'width/height' };
  }

  return { x: 0, y: 0, width: fallback.width, height: fallback.height, source: 'fallback' };
}

/** Intrinsic size of a parsed `<svg>` element. */
export function readViewBox(svgEl: Element, fallback: ViewBoxFallback): ViewBox {
  return parseSizeAttrs(
    {
      viewBox: svgEl.getAttribute('viewBox'),
      width: svgEl.getAttribute('width'),
      height: svgEl.getAttribute('height'),
    },
    fallback
  );
}

/**
 * Intrinsic size read straight out of markup, without a DOM parse.
 *
 * The icon-set loader runs this once per file over a few hundred files while
 * building the gallery, where a full `DOMParser` round-trip per icon is real
 * time spent for three attributes.
 */
export function readViewBoxFromMarkup(svg: string, fallback: ViewBoxFallback): ViewBox {
  // Only the root start tag, so a child's `width` or a `stroke-width` cannot
  // be mistaken for the document's own size.
  const openTag = svg.match(/<svg\b[^>]*>/i)?.[0] ?? '';
  const attr = (name: string): string | null => {
    const match = openTag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
    return match ? match[1] : null;
  };

  return parseSizeAttrs(
    { viewBox: attr('viewBox'), width: attr('width'), height: attr('height') },
    fallback
  );
}
