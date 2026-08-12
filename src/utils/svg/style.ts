import type { FillRule } from '../regions/regions';
import type { LineCap, LineJoin } from '../strokeOutline';
import { hexChannels, relativeLuminance } from '../color';

/**
 * What a shape is painted with, and how big the document is.
 *
 * All of the CSS *precedence* this converter models lives here and nowhere
 * else: presentation attributes, `<style>` rules, inline `style`, inheritance
 * up the tree, gradient stop approximation and opacity compositing.
 *
 *   stylesheet   parsing a `<style>` block into class rules
 *   paint        resolving fill, stroke, opacity and the stroke geometry enums
 *   viewBox      the document's intrinsic size and user-space window
 */

// ---------------------------------------------------------------------------
// Stylesheet
// ---------------------------------------------------------------------------

/**
 * The `<style>` element, reduced to the three properties this converter can
 * act on.
 *
 * Split from `paint.ts` because it is the only part of the cascade that reads
 * the *document* rather than an element: it runs once per file and produces a
 * lookup table everything else consumes. Keeping it apart also keeps
 * `paint.ts` about precedence rather than about regexes.
 *
 * Deliberately not a real CSS parser. Only class selectors are supported,
 * which is what design tools emit; anything else is ignored rather than
 * mis-applied.
 */

/** One `<style>` rule, reduced to the properties this converter models. */
interface CssPaintRule {
  fill?: string;
  stroke?: string;
  opacity?: number;
}

/** Class name (without the leading dot) -> merged declarations. */
export type StyleMap = Record<string, CssPaintRule>;

/** Extracts CSS stylesheet rules from <style> elements inside SVG DOM */
export function parseCssStylesheet(doc: Document): StyleMap {
  const styleMap: StyleMap = {};
  doc.querySelectorAll('style').forEach(styleEl => {
    const text = styleEl.textContent || '';
    const ruleBlocks = text.match(/([^{]+)\{([^}]+)\}/g) || [];
    ruleBlocks.forEach(block => {
      const parts = block.split('{');
      if (parts.length < 2) return;
      const selectors = parts[0].split(',').map(s => s.trim().replace(/^\./, ''));
      const declsStr = parts[1];

      let fill: string | undefined;
      let stroke: string | undefined;
      let opacity: number | undefined;

      const fillMatch = declsStr.match(/fill\s*:\s*([^;}]+)/i);
      if (fillMatch && fillMatch[1].trim() !== 'none') fill = fillMatch[1].trim();

      const strokeMatch = declsStr.match(/stroke\s*:\s*([^;}]+)/i);
      if (strokeMatch && strokeMatch[1].trim() !== 'none') stroke = strokeMatch[1].trim();

      const opacityMatch = declsStr.match(/opacity\s*:\s*([^;}]+)/i);
      if (opacityMatch) opacity = parseFloat(opacityMatch[1]);

      selectors.forEach(sel => {
        if (!styleMap[sel]) styleMap[sel] = {};
        if (fill) styleMap[sel].fill = fill;
        if (stroke) styleMap[sel].stroke = stroke;
        if (opacity !== undefined) styleMap[sel].opacity = opacity;
      });
    });
  });
  return styleMap;
}

/**
 * Resolving what colour a shape is painted, and how opaque.
 *
 * All of the CSS *precedence* this converter models lives here and nowhere
 * else: presentation attributes, `<style>` rules, inline `style`, inheritance
 * up the tree, gradient stop approximation and opacity compositing. Keeping it
 * in one module is what makes the ordering readable in one pass instead of
 * being rediscovered at each call site. Parsing the stylesheet itself is
 * `stylesheet.ts`.
 */

// ---------------------------------------------------------------------------
// Paint
// ---------------------------------------------------------------------------

/** The SVG initial value of the `fill` property. Undeclared is *not* `none`. */
const DEFAULT_FILL = '#000000';

/**
 * The id inside a `url(#foo)` / `url('#foo')` reference, or null.
 *
 * The character class has to exclude `)` and whitespace as well as the
 * quotes: `url(#grad)` against a quotes-only class captures `grad)`, which
 * then matches no element and silently drops the paint.
 */
export const refId = (value: string | null | undefined): string | null =>
  value?.match(/#([^'")\s]+)/)?.[1] ?? null;

const toPercent = (value: number): number =>
  Math.min(Math.max(Math.round(value * 100), 0), 100);

/** Nearest declared value of an inherited presentation attribute. */
function getInheritedPresentation(el: Element, name: string): string | null {
  let current: Element | null = el;
  while (current) {
    const value = current.getAttribute?.(name);
    if (value) return value.trim().toLowerCase();
    current = current.parentElement;
  }
  return null;
}

/**
 * Nearest *recognised* value of an inherited enumerated property.
 *
 * Distinct from `getInheritedPresentation`, which stops at the first declared
 * value whatever it says. Here an unrecognised keyword (`inherit`, a typo)
 * keeps the walk going, so it behaves like the property being unset on that
 * ancestor rather than resetting the whole chain to the fallback.
 */
export function inheritedEnum<T extends string>(
  el: Element,
  attr: string,
  allowed: readonly T[],
  fallback: T
): T {
  let current: Element | null = el;
  while (current) {
    const value = current.getAttribute?.(attr);
    if (value) {
      const normalised = value.trim().toLowerCase() as T;
      if (allowed.includes(normalised)) return normalised;
    }
    current = current.parentElement;
  }
  return fallback;
}

/**
 * Recognised values of `fill-rule`, and of `clip-rule`, which mirrors it for
 * the shapes inside a `<clipPath>`. There is no `getInheritedClipRule`: it was
 * a byte-for-byte copy of `getInheritedFillRule` with one attribute name
 * changed, so `clipping.ts` calls `inheritedEnum` with these directly.
 */
export const FILL_RULES = ['evenodd', 'nonzero'] as const;

/**
 * `fill-rule` is an inherited property, so an unset element takes its value
 * from the nearest ancestor that declares one. Defaults to `nonzero` per spec.
 */
export function getInheritedFillRule(el: Element): FillRule {
  return inheritedEnum(el, 'fill-rule', FILL_RULES, 'nonzero');
}

/** The subset of paint declarations this converter models, from one source. */
interface PaintDecls {
  fill?: string;
  stroke?: string;
  strokeWidth?: string;
  opacity?: string;
}

/** Reads `fill`/`stroke`/`stroke-width` out of a `style="…"` attribute. */
function readStyleAttribute(el: Element): PaintDecls {
  const text = el.getAttribute('style');
  if (!text) return {};

  const out: PaintDecls = {};
  const fillMatch = text.match(/(?:^|[;\s])fill\s*:\s*([^;}]+)/i);
  if (fillMatch) out.fill = fillMatch[1].trim();
  const strokeMatch = text.match(/(?:^|[;\s])stroke\s*:\s*([^;}]+)/i);
  if (strokeMatch) out.stroke = strokeMatch[1].trim();
  const swMatch = text.match(/stroke-width\s*:\s*([^;}]+)/i);
  if (swMatch) out.strokeWidth = swMatch[1].trim();
  const opacityMatch = text.match(/(?:^|[;\s])opacity\s*:\s*([^;}]+)/i);
  if (opacityMatch) out.opacity = opacityMatch[1].trim();
  return out;
}

/** Merges the `<style>` rules matching this element's `class` list. */
function readClassRules(el: Element, styleMap: StyleMap): PaintDecls {
  const className = el.getAttribute('class');
  if (!className) return {};

  const out: PaintDecls = {};
  for (const name of className.split(/\s+/)) {
    const rule = styleMap[name];
    if (!rule) continue;
    if (rule.fill) out.fill = rule.fill;
    if (rule.stroke) out.stroke = rule.stroke;
    if (rule.opacity !== undefined) out.opacity = String(rule.opacity);
  }
  return out;
}

/**
 * Everything one element declares, in ascending CSS precedence:
 * presentation attribute < stylesheet rule < inline `style`.
 *
 * NOTE: `getShapeStyle` deliberately does *not* apply this ordering to the
 * shape itself - there, a presentation attribute still beats a stylesheet rule
 * (see the comment at the call site). The ordering here governs which
 * declaration wins *within a single ancestor*, which was previously not
 * modelled at all because ancestors were read for attributes only.
 */
function declaredPaint(el: Element, styleMap: StyleMap): PaintDecls {
  const attrs: PaintDecls = {};
  const fill = el.getAttribute('fill');
  if (fill) attrs.fill = fill;
  const stroke = el.getAttribute('stroke');
  if (stroke) attrs.stroke = stroke;
  const strokeWidth = el.getAttribute('stroke-width');
  if (strokeWidth) attrs.strokeWidth = strokeWidth;

  return { ...attrs, ...readClassRules(el, styleMap), ...readStyleAttribute(el) };
}

/**
 * Everything the converter needs to know about how one shape is painted.
 *
 * Named rather than inferred because it crosses three module boundaries -
 * the per-tag converters read it, the stroke outliner consumes half of it,
 * and the emitter the other half.
 */
export interface ShapeStyle {
  /** Resolved fill paint, or `'transparent'`. */
  fill: string;
  /** Resolved stroke paint, or `'transparent'`. */
  stroke: string;
  isFillNone: boolean;
  isStrokeNone: boolean;
  fillRule: FillRule;
  lineCap: LineCap;
  lineJoin: LineJoin;
  miterLimit: number;
  /**
   * Raw width in *user units*. Scaling to output pixels happens at emit time,
   * once the element transform and the viewBox->target factor are both known.
   * Rounding here (the old behaviour) both destroyed sub-pixel hairlines and
   * made a `stroke-width="2"` icon render at half thickness.
   */
  strokeWidth: number;
  /** Fill opacity, 0..100, as Excalidraw wants it. */
  opacity: number;
  /** Stroke opacity, 0..100. */
  strokeOpacityPct: number;
}

/** Resolves computed element fill, stroke, width, and opacity */
export function getShapeStyle(el: Element, styleMap: StyleMap, doc: Document): ShapeStyle {
  let fill = el.getAttribute('fill');
  let stroke = el.getAttribute('stroke');
  /**
   * Group `opacity` composites rather than inherits, so it multiplies down the
   * tree instead of being overridden by the nearest declaration. Ignoring
   * ancestors entirely - the old behaviour - rendered `<g opacity="0.5">`
   * fully opaque.
   *
   * Compositing a group as a unit and compositing its members individually
   * only differ where members overlap each other; per-shape is the closest
   * Excalidraw can express.
   */
  const readOpacity = (value: string | null): number => {
    if (!value) return 1;
    const text = value.trim();
    const parsed = text.endsWith('%') ? parseFloat(text) / 100 : parseFloat(text);
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1) : 1;
  };

  let groupOpacity = 1;
  for (let node: Element | null = el; node; node = node.parentElement) {
    groupOpacity *= readOpacity(node.getAttribute?.('opacity') ?? null);
    // The element's own `style` opacity is applied further down, where it
    // replaces rather than composites; multiplying it here too would
    // double-count it.
    if (node !== el) groupOpacity *= readOpacity(readStyleAttribute(node).opacity ?? null);
  }
  const fillOpacity = readOpacity(el.getAttribute('fill-opacity'));
  const strokeOpacity = readOpacity(el.getAttribute('stroke-opacity'));
  let strokeWidthStr: string | null = null;

  // Own declarations first. A presentation attribute still beats a stylesheet
  // rule here, which is backwards per CSS but is long-standing behaviour that
  // the curated icon baseline depends on; `flattenStyleCascade` in the
  // optimizer already resolves the cascade correctly for that path.
  const ownClassRules = readClassRules(el, styleMap);
  if (!fill && ownClassRules.fill) fill = ownClassRules.fill;
  if (!stroke && ownClassRules.stroke) stroke = ownClassRules.stroke;
  if (ownClassRules.opacity !== undefined) groupOpacity *= readOpacity(ownClassRules.opacity);

  const elStrokeWidth = el.getAttribute('stroke-width');
  if (elStrokeWidth) strokeWidthStr = elStrokeWidth;

  /**
   * Then inherit, nearest ancestor first, for anything still undeclared.
   *
   * Two things were previously missed here. The walk stopped *before* the root
   * `<svg>`, so `<svg fill="none" stroke="currentColor">` - the shape of every
   * Feather, Lucide, Tabler, Bootstrap and Heroicons outline icon, and of most
   * of what SVG Repo serves - contributed nothing and every child resolved to
   * "no fill, no stroke" and was dropped. And ancestors were read for
   * presentation *attributes* only, so `<g style="fill:#111">` and
   * `<g class="ico">` were invisible.
   *
   * The walk stops after the nearest `<svg>` because a nested one establishes
   * its own viewport; that case is reported as unsupported elsewhere.
   */
  for (let ancestor: Element | null = el.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const declared = declaredPaint(ancestor, styleMap);
    if (!fill) fill = declared.fill ?? null;
    if (!stroke) stroke = declared.stroke ?? null;
    if (!strokeWidthStr) strokeWidthStr = declared.strokeWidth ?? null;
    if (ancestor.tagName.toLowerCase() === 'svg') break;
  }

  // Finally the element's own inline style, which outranks everything.
  const ownStyle = readStyleAttribute(el);
  if (ownStyle.fill) fill = ownStyle.fill;
  if (ownStyle.stroke) stroke = ownStyle.stroke;
  if (ownStyle.strokeWidth) strokeWidthStr = ownStyle.strokeWidth;
  if (ownStyle.opacity) groupOpacity = readOpacity(ownStyle.opacity);

  // Approximate a gradient by its middle stop. Build-time artwork has already
  // had `flattenGradients` run over it; this is the upload path.
  const gradId = fill?.startsWith('url(') ? refId(fill) : null;
  if (gradId) {
    const stopEls = doc.querySelector(`[id="${gradId}"]`)?.querySelectorAll('stop');
    if (stopEls?.length) {
      const midStop = stopEls[Math.floor(stopEls.length / 2)];
      const styleMatch = (midStop.getAttribute('style') || '').match(/stop-color\s*:\s*([^;}]+)/i);
      const stopColor = midStop.getAttribute('stop-color') || styleMatch?.[1];
      if (stopColor) fill = stopColor.trim();
    }
  }

  const isNoPaint = (value: string | null): boolean => {
    if (!value) return false;
    const normalised = value.trim().toLowerCase();
    return normalised === 'none' || normalised === 'transparent';
  };

  /**
   * The initial value of `fill` is black, not `none`. Conflating "undeclared"
   * with "explicitly none" - the old behaviour - silently discarded every
   * shape in a file that relies on the SVG default, which is most hand-written
   * and CSS-driven artwork. `stroke` genuinely does default to `none`, so only
   * `fill` gets a fallback.
   */
  const isFillNone = isNoPaint(fill);
  const isStrokeNone = !stroke || isNoPaint(stroke);
  if (!fill) fill = DEFAULT_FILL;

  return {
    // `fill` cannot be null here - the line above gives it the SVG initial
    // value - so it needs no fallback of its own, unlike `stroke`, which
    // genuinely does default to none.
    fill: isFillNone ? 'transparent' : fill,
    stroke: isStrokeNone ? 'transparent' : (stroke || 'transparent'),
    isFillNone,
    isStrokeNone,
    fillRule: getInheritedFillRule(el),
    lineCap: (getInheritedPresentation(el, 'stroke-linecap') as LineCap) || 'butt',
    lineJoin: (getInheritedPresentation(el, 'stroke-linejoin') as LineJoin) || 'miter',
    miterLimit: Number(getInheritedPresentation(el, 'stroke-miterlimit')) || 4,
    strokeWidth: strokeWidthStr && Number.isFinite(parseFloat(strokeWidthStr))
      ? Math.max(parseFloat(strokeWidthStr), 0)
      : 1,
    opacity: toPercent(groupOpacity * fillOpacity),
    strokeOpacityPct: toPercent(groupOpacity * strokeOpacity),
  };
}

/**
 * Relative luminance of a paint value, 0..1. Used to decide whether a shape
 * inside a `<mask>` reveals or conceals.
 *
 * An SVG shape with no `fill` defaults to black, i.e. fully transparent in a
 * luminance mask - which is exactly how the flood-white idiom in
 * `resolveMaskRegion` works.
 */
export function paintLuminance(value: string | null): number {
  if (!value) return 0;
  const paint = value.trim().toLowerCase();
  if (paint === 'none' || paint === 'transparent') return 0;
  if (paint === 'white' || paint === '#fff' || paint === '#ffffff') return 1;
  if (paint === 'black' || paint === '#000' || paint === '#000000') return 0;

  const hex = hexChannels(paint);
  if (hex) return relativeLuminance(...hex);

  // `rgba()` as well as `rgb()`, and space- or comma-separated, which is why
  // this is not `parseHexColor`.
  const rgb = paint.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (!rgb) return 1; // unknown named colour: assume it reveals
  return relativeLuminance(+rgb[1], +rgb[2], +rgb[3]);
}

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

// ---------------------------------------------------------------------------
// viewBox
// ---------------------------------------------------------------------------

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
