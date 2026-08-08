import * as pointsOnPathModule from 'points-on-path';
import {
  IconAsset,
  ExcalidrawOptions,
  ExcalidrawElement,
  ExcalidrawFile,
  ExcalidrawLibraryPackage,
} from '../types';
import {
  FillRule,
  MultiPolygon,
  Point,
  bridgeHoles,
  intersectMultiPolygons,
  intersectRingWithRegion,
  multiPolygonBounds,
  differenceMultiPolygons,
  polygonsToMultiPolygon,
  rectRegion,
  regionToBridgedRings,
  resolveFilledRegions,
  signedArea,
  unionMultiPolygons,
} from './pathRegions';
import { LineCap, LineJoin, strokeToRegion } from './strokeOutline';
import { ICON_BASE_SIZE } from './defaultOptions';
import { lineHeightFor, measureLabel } from './textMetrics';

function getPointsOnPath(path: string, tolerance?: number, distance?: number): [number, number][][] {
  const mod: any = pointsOnPathModule;
  const fn = mod.pointsOnPath || mod.default?.pointsOnPath || mod.default || mod;
  if (typeof fn === 'function') {
    return fn(path, tolerance, distance);
  }
  return [];
}

function generateRandomId(): string {
  return Math.random().toString(16).substring(2, 18);
}

function generateRandomSeed(): number {
  return Math.floor(Math.random() * 2000000000);
}

/**
 * Target curve-flattening error at the default 48px icon size, in user units
 * of a nominal 1x fit. Divided by the actual viewBox->target scale so the
 * error stays constant in output pixels as `iconScale` grows.
 *
 * Empirically 0.002 puts a 9-unit circle at ~0.003 user units of sagitta -
 * under a hundredth of a pixel at 48px - for ~130 points.
 */
const CURVE_TOLERANCE_USER_UNITS_AT_1X = 0.002;

/**
 * A hole smaller than this many square output pixels is dropped rather than
 * bridged. Well below one pixel, so nothing visible is ever discarded.
 */
const MIN_VISIBLE_HOLE_AREA_PX = 0.02;

/**
 * Floor for an emitted stroke width. Excalidraw accepts any positive number,
 * but a zero-width stroke silently disappears, so a shape that declared a
 * stroke always keeps a visible one.
 */
const MIN_STROKE_WIDTH = 0.25;

/** The SVG initial value of the `fill` property. Undeclared is *not* `none`. */
const DEFAULT_FILL = '#000000';

/**
 * How close to the artboard edge a shape must reach, as a fraction of the
 * viewBox, before it is a background-plate candidate. Half a unit on the 24x24
 * artboard these icons are authored against.
 */
const ARTBOARD_MARGIN_FRACTION = 0.5 / 24;

/**
 * Fraction of its own bounding box a shape must ink to count as a background
 * plate rather than artwork. A rectangle is 1.0 and a full ellipse is pi/4;
 * anything with real internal structure is far below both.
 */
const BACKGROUND_PLATE_SOLIDITY = 0.75;

/** 2D Affine Matrix transformation representation: [a, b, c, d, e, f] */
type Matrix2D = [number, number, number, number, number, number];

function multiplyMatrix(m1: Matrix2D, m2: Matrix2D): Matrix2D {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function applyMatrix(m: Matrix2D, p: [number, number]): [number, number] {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}

/**
 * Uniform scale factor a transform applies to stroke width.
 *
 * SVG defines this as sqrt(|det|) for a non-uniform matrix, which is the
 * geometric mean of the two axis scales - the same value a browser uses.
 */
function matrixScale(m: Matrix2D): number {
  const determinant = Math.abs(m[0] * m[3] - m[1] * m[2]);
  return determinant > 0 ? Math.sqrt(determinant) : 1;
}

function parseTransformMatrix(transformStr: string | null): Matrix2D {
  let m: Matrix2D = [1, 0, 0, 1, 0, 0];
  if (!transformStr) return m;

  const commands = transformStr.match(/\w+\([^)]+\)/g) || [];
  commands.forEach(cmd => {
    const typeMatch = cmd.match(/^(\w+)\(([^)]+)\)/);
    if (!typeMatch) return;
    const name = typeMatch[1].toLowerCase();
    const args = typeMatch[2].trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));

    if (name === 'matrix' && args.length >= 6) {
      m = multiplyMatrix(m, [args[0], args[1], args[2], args[3], args[4], args[5]]);
    } else if (name === 'translate') {
      const dx = args[0] || 0;
      const dy = args[1] !== undefined ? args[1] : 0;
      m = multiplyMatrix(m, [1, 0, 0, 1, dx, dy]);
    } else if (name === 'scale') {
      const sx = args[0] || 1;
      const sy = args[1] !== undefined ? args[1] : sx;
      m = multiplyMatrix(m, [sx, 0, 0, sy, 0, 0]);
    } else if (name === 'rotate') {
      const rad = ((args[0] || 0) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      if (args.length >= 3) {
        const cx = args[1];
        const cy = args[2];
        m = multiplyMatrix(m, [1, 0, 0, 1, cx, cy]);
        m = multiplyMatrix(m, [cos, sin, -sin, cos, 0, 0]);
        m = multiplyMatrix(m, [1, 0, 0, 1, -cx, -cy]);
      } else {
        m = multiplyMatrix(m, [cos, sin, -sin, cos, 0, 0]);
      }
    }
  });

  return m;
}

/**
 * Accumulated transform from `el` up to (but excluding) `stopAt`, or up to the
 * root `<svg>` when `stopAt` is omitted.
 */
function getCombinedTransformMatrixUntil(el: Element, stopAt?: Element): Matrix2D {
  let current: Element | null = el;
  const matrices: Matrix2D[] = [];
  while (current && current !== stopAt && current.tagName.toLowerCase() !== 'svg') {
    const transformAttr = current.getAttribute('transform');
    if (transformAttr) {
      matrices.unshift(parseTransformMatrix(transformAttr));
    }
    current = current.parentElement;
  }
  let combined: Matrix2D = [1, 0, 0, 1, 0, 0];
  matrices.forEach(mat => {
    combined = multiplyMatrix(combined, mat);
  });
  return combined;
}

function getCombinedTransformMatrix(el: Element): Matrix2D {
  return getCombinedTransformMatrixUntil(el);
}

/** Creates a base Excalidraw element with all required default properties */
function createBaseElement(
  type: string,
  x: number,
  y: number,
  width: number,
  height: number,
  groupId: string,
  overrides: Partial<ExcalidrawElement> = {}
): ExcalidrawElement {
  return {
    id: generateRandomId(),
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: 'transparent',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 1,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    groupIds: [groupId],
    frameId: null,
    index: 'a1',
    roundness: null,
    seed: generateRandomSeed(),
    version: 1,
    versionNonce: generateRandomSeed(),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    ...overrides,
  };
}

/**
 * Segments needed to approximate a quarter-ellipse of the given radii to
 * within `tolerance` user units.
 *
 * Excalidraw's `roundness` cannot express a specific radius, so rounded
 * corners have to become real geometry. Deriving the count from the radius
 * keeps a 0.24-unit corner cheap and a 6-unit corner smooth.
 */
function arcSegments(rx: number, ry: number, tolerance: number): number {
  const radius = Math.max(rx, ry);
  if (radius <= 0) return 1;
  // Sagitta of a chord subtending angle t on a circle of radius r is
  // r * (1 - cos(t/2)); solve for the t that keeps it under tolerance.
  const ratio = Math.max(-1, Math.min(1, 1 - tolerance / radius));
  const maxAngle = 2 * Math.acos(ratio);
  return Math.max(2, Math.min(64, Math.ceil(Math.PI / 2 / maxAngle)));
}

/**
 * Closed ring for a `<rect>`, with elliptical corners when rx/ry are set.
 *
 * Emitted counter-clockwise in SVG's y-down space so the winding matches every
 * other ring this module produces.
 */
function rectangleRing(x: number, y: number, w: number, h: number, rx: number, ry: number, tolerance: number): Point[] {
  if (rx <= 0 || ry <= 0) {
    return [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ];
  }

  const segments = arcSegments(rx, ry, tolerance);
  const ring: Point[] = [];
  const corners: Array<{ cx: number; cy: number; from: number }> = [
    { cx: x + w - rx, cy: y + ry, from: -Math.PI / 2 }, // top-right
    { cx: x + w - rx, cy: y + h - ry, from: 0 }, // bottom-right
    { cx: x + rx, cy: y + h - ry, from: Math.PI / 2 }, // bottom-left
    { cx: x + rx, cy: y + ry, from: Math.PI }, // top-left
  ];

  ring.push([x + rx, y]);
  for (const { cx, cy, from } of corners) {
    for (let i = 0; i <= segments; i++) {
      const angle = from + (Math.PI / 2) * (i / segments);
      ring.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
    }
  }

  return ring;
}

interface RawShape {
  type: 'line' | 'ellipse';
  absPoints?: [number, number][];
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
}

/**
 * Why a shape in the source never became an element.
 *
 * The converter used to drop shapes silently, which made every failure look
 * identical from the outside: an empty canvas, or the flat message "No
 * drawable geometry found in that file." Attributing each drop is the
 * difference between a user filing a useful bug and giving up.
 */
export type DropReason =
  | 'no-fill-no-stroke'
  | 'empty-geometry'
  | 'clipped-away'
  | 'degenerate'
  | 'parse-error'
  | 'in-defs';

export interface ShapeDrop {
  reason: DropReason;
  /** Tag name of the source element, e.g. `path`. */
  tag: string;
  count: number;
  detail: string;
}

export interface ConversionDiagnostics {
  drops: ShapeDrop[];
  /** Total source shapes that produced no output. */
  skippedTotal: number;
}

export const DROP_REASON_LABELS: Record<DropReason, string> = {
  'no-fill-no-stroke': 'resolved to no fill and no stroke',
  'empty-geometry': 'had no geometry to draw',
  'clipped-away': 'was clipped or masked away entirely',
  degenerate: 'collapsed to nothing at the output size',
  'parse-error': 'could not be parsed',
  'in-defs': 'is a definition, only drawn where referenced',
};

export function emptyDiagnostics(): ConversionDiagnostics {
  return { drops: [], skippedTotal: 0 };
}

/** Extracts CSS stylesheet rules from <style> elements inside SVG DOM */
function parseCssStylesheet(doc: Document): Record<string, { fill?: string; stroke?: string; opacity?: number }> {
  const styleMap: Record<string, { fill?: string; stroke?: string; opacity?: number }> = {};
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

      const fillMatch = declsStr.match(/fill\s*:\s*([^;\}]+)/i);
      if (fillMatch && fillMatch[1].trim() !== 'none') fill = fillMatch[1].trim();

      const strokeMatch = declsStr.match(/stroke\s*:\s*([^;\}]+)/i);
      if (strokeMatch && strokeMatch[1].trim() !== 'none') stroke = strokeMatch[1].trim();

      const opacityMatch = declsStr.match(/opacity\s*:\s*([^;\}]+)/i);
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

const toPercent = (value: number): number => Math.min(Math.max(Math.round(value * 100), 0), 100);

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
 * `fill-rule` is an inherited property, so an unset element takes its value
 * from the nearest ancestor that declares one. Defaults to `nonzero` per spec.
 */
function getInheritedFillRule(el: Element): FillRule {
  let current: Element | null = el;
  while (current) {
    const value = current.getAttribute?.('fill-rule');
    if (value) {
      const normalised = value.trim().toLowerCase();
      if (normalised === 'evenodd') return 'evenodd';
      if (normalised === 'nonzero') return 'nonzero';
    }
    current = current.parentElement;
  }
  return 'nonzero';
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
  const fillMatch = text.match(/(?:^|[;\s])fill\s*:\s*([^;\}]+)/i);
  if (fillMatch) out.fill = fillMatch[1].trim();
  const strokeMatch = text.match(/(?:^|[;\s])stroke\s*:\s*([^;\}]+)/i);
  if (strokeMatch) out.stroke = strokeMatch[1].trim();
  const swMatch = text.match(/stroke-width\s*:\s*([^;\}]+)/i);
  if (swMatch) out.strokeWidth = swMatch[1].trim();
  const opacityMatch = text.match(/(?:^|[;\s])opacity\s*:\s*([^;\}]+)/i);
  if (opacityMatch) out.opacity = opacityMatch[1].trim();
  return out;
}

/** Merges the `<style>` rules matching this element's `class` list. */
function readClassRules(el: Element, styleMap: Record<string, any>): PaintDecls {
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
function declaredPaint(el: Element, styleMap: Record<string, any>): PaintDecls {
  const attrs: PaintDecls = {};
  const fill = el.getAttribute('fill');
  if (fill) attrs.fill = fill;
  const stroke = el.getAttribute('stroke');
  if (stroke) attrs.stroke = stroke;
  const strokeWidth = el.getAttribute('stroke-width');
  if (strokeWidth) attrs.strokeWidth = strokeWidth;

  return { ...attrs, ...readClassRules(el, styleMap), ...readStyleAttribute(el) };
}

/** Resolves computed element fill, stroke, width, and opacity */
function getShapeStyle(el: Element, styleMap: Record<string, any>, doc: Document) {
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

  // Handle gradient URL resolution
  if (fill && fill.startsWith('url(')) {
    const gradIdMatch = fill.match(/#([^'"]+)/);
    if (gradIdMatch) {
      const gradEl = doc.querySelector(`[id="${gradIdMatch[1]}"]`);
      if (gradEl) {
        const stopEls = gradEl.querySelectorAll('stop');
        if (stopEls.length > 0) {
          const midStop = stopEls[Math.floor(stopEls.length / 2)];
          const midStyle = midStop.getAttribute('style') || '';
          const styleMatch = midStyle.match(/stop-color\s*:\s*([^;\}]+)/i);
          const stopColor = midStop.getAttribute('stop-color') || (styleMatch ? styleMatch[1] : null);
          if (stopColor) fill = stopColor.trim();
        }
      }
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
    fill: isFillNone ? 'transparent' : (fill || 'transparent'),
    stroke: isStrokeNone ? 'transparent' : (stroke || 'transparent'),
    isFillNone,
    isStrokeNone,
    fillRule: getInheritedFillRule(el),
    lineCap: (getInheritedPresentation(el, 'stroke-linecap') as LineCap) || 'butt',
    lineJoin: (getInheritedPresentation(el, 'stroke-linejoin') as LineJoin) || 'miter',
    miterLimit: Number(getInheritedPresentation(el, 'stroke-miterlimit')) || 4,
    // Raw width in *user units*. Scaling to output pixels happens at emit
    // time, once the element transform and the viewBox->target factor are
    // both known. Rounding here (the old behaviour) both destroyed sub-pixel
    // hairlines and made a `stroke-width="2"` icon render at half thickness.
    strokeWidth: strokeWidthStr && Number.isFinite(parseFloat(strokeWidthStr))
      ? Math.max(parseFloat(strokeWidthStr), 0)
      : 1,
    opacity: toPercent(groupOpacity * fillOpacity),
    strokeOpacityPct: toPercent(groupOpacity * strokeOpacity),
  };
}

/**
 * Excalidraw refuses to fill a `line` element unless its point list forms a
 * closed loop (`isPathALoop`: distance(first, last) <= LINE_CONFIRM_THRESHOLD).
 *
 * SVG, on the other hand, implicitly closes every filled subpath. So a path
 * like `M0 0 L10 0 L10 10` renders as a filled triangle in a browser but as
 * *nothing* in Excalidraw. Compound "donut" paths bridged below are also left
 * open by construction. We therefore close every ring we intend to fill.
 */
function closeRing(pts: [number, number][]): [number, number][] {
  if (pts.length < 3) return pts;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= 1e-6) return pts;
  return [...pts, [first[0], first[1]]];
}

/** Flattens any SVG shape element into closed rings in its own user space. */
function shapeToRings(el: Element, tolerance: number): Point[][] {
  const tag = el.tagName.toLowerCase();

  if (tag === 'path') {
    const d = el.getAttribute('d') || '';
    if (!d.trim()) return [];
    return getPointsOnPath(d, tolerance) as Point[][];
  }

  if (tag === 'rect') {
    const x = parseFloat(el.getAttribute('x') || '0');
    const y = parseFloat(el.getAttribute('y') || '0');
    const w = parseFloat(el.getAttribute('width') || '0');
    const h = parseFloat(el.getAttribute('height') || '0');
    if (!(w > 0 && h > 0)) return [];
    const rxAttr = el.getAttribute('rx');
    const ryAttr = el.getAttribute('ry');
    const rxRaw = rxAttr !== null ? parseFloat(rxAttr) : ryAttr !== null ? parseFloat(ryAttr) : 0;
    const ryRaw = ryAttr !== null ? parseFloat(ryAttr) : rxRaw;
    return [
      rectangleRing(
        x,
        y,
        w,
        h,
        Math.min(Math.max(Number.isFinite(rxRaw) ? rxRaw : 0, 0), w / 2),
        Math.min(Math.max(Number.isFinite(ryRaw) ? ryRaw : 0, 0), h / 2),
        tolerance
      ),
    ];
  }

  if (tag === 'circle' || tag === 'ellipse') {
    const cx = parseFloat(el.getAttribute('cx') || '0');
    const cy = parseFloat(el.getAttribute('cy') || '0');
    const rx = tag === 'circle' ? parseFloat(el.getAttribute('r') || '0') : parseFloat(el.getAttribute('rx') || '0');
    const ry = tag === 'circle' ? rx : parseFloat(el.getAttribute('ry') || '0');
    if (!(rx > 0 && ry > 0)) return [];
    const ring: Point[] = [];
    const segments = arcSegments(rx, ry, tolerance) * 4;
    for (let i = 0; i < segments; i++) {
      const angle = (2 * Math.PI * i) / segments;
      ring.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
    }
    return [ring];
  }

  if (tag === 'polygon' || tag === 'polyline') {
    const coords = (el.getAttribute('points') || '')
      .trim()
      .split(/[\s,]+/)
      .map(Number)
      .filter(n => !isNaN(n));
    const ring: Point[] = [];
    for (let i = 0; i + 1 < coords.length; i += 2) ring.push([coords[i], coords[i + 1]]);
    return ring.length >= 3 ? [ring] : [];
  }

  return [];
}

/** `clip-rule` mirrors `fill-rule`, but for the shapes inside a `<clipPath>`. */
function getInheritedClipRule(el: Element): FillRule {
  let current: Element | null = el;
  while (current) {
    const value = current.getAttribute?.('clip-rule');
    if (value) {
      const normalised = value.trim().toLowerCase();
      if (normalised === 'evenodd') return 'evenodd';
      if (normalised === 'nonzero') return 'nonzero';
    }
    current = current.parentElement;
  }
  return 'nonzero';
}

/** The region a single `<clipPath>` defines, in the referencing element's space. */
function resolveClipPathRegion(
  clipEl: Element,
  referenceMatrix: Matrix2D,
  tolerance: number,
  box: BoundingBox | null
): MultiPolygon {
  // `clipPathUnits` defaults to userSpaceOnUse; under objectBoundingBox the
  // child coordinates are fractions of the referencing element's box.
  const unitMatrix =
    (clipEl.getAttribute('clipPathUnits') || 'userSpaceOnUse') === 'objectBoundingBox' && box
      ? multiplyMatrix(referenceMatrix, boundingBoxMatrix(box))
      : referenceMatrix;

  const regions: MultiPolygon[] = [];

  clipEl.querySelectorAll('path, polygon, polyline, rect, circle, ellipse').forEach(shape => {
    const matrix = multiplyMatrix(unitMatrix, getCombinedTransformMatrixUntil(shape, clipEl));
    const rings = shapeToRings(shape, tolerance);
    if (rings.length === 0) return;

    const transformed = rings.map(ring => ring.map(pt => applyMatrix(matrix, pt)));
    const polygons = resolveFilledRegions(transformed, getInheritedClipRule(shape));
    if (polygons.length > 0) regions.push(polygonsToMultiPolygon(polygons));
  });

  // Multiple children of one clipPath union together.
  return unionMultiPolygons(regions);
}

/**
 * Relative luminance of a paint value, 0..1. Used to decide whether a shape
 * inside a `<mask>` reveals or conceals.
 *
 * An SVG shape with no `fill` defaults to black, i.e. fully transparent in a
 * luminance mask - which is exactly how the flood-white idiom below works.
 */
function paintLuminance(value: string | null): number {
  if (!value) return 0;
  const paint = value.trim().toLowerCase();
  if (paint === 'none' || paint === 'transparent') return 0;
  if (paint === 'white' || paint === '#fff' || paint === '#ffffff') return 1;
  if (paint === 'black' || paint === '#000' || paint === '#000000') return 0;

  let r = 0;
  let g = 0;
  let b = 0;

  const hex = paint.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const digits = hex[1].length === 3 ? hex[1].split('').map(c => c + c).join('') : hex[1];
    r = parseInt(digits.slice(0, 2), 16);
    g = parseInt(digits.slice(2, 4), 16);
    b = parseInt(digits.slice(4, 6), 16);
  } else {
    const rgb = paint.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
    if (!rgb) return 1; // unknown named colour: assume it reveals
    r = parseFloat(rgb[1]);
    g = parseFloat(rgb[2]);
    b = parseFloat(rgb[3]);
  }

  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Geometry bounding box of `node` in its own user space.
 *
 * This is what `objectBoundingBox` units are fractions of. Per spec it covers
 * geometry only - stroke, markers and clipping are excluded - and it is
 * expressed in the coordinate system `node` establishes for its children,
 * which is exactly the space `referenceMatrix` already maps from. Hence each
 * descendant is transformed only as far up as `node`, never including `node`'s
 * own transform.
 *
 * Returns null when there is no geometry, or when the box is degenerate in
 * either axis: the unit matrix would be singular, and the spec says such a
 * reference simply does not apply.
 */
function localBoundingBox(node: Element, tolerance: number): BoundingBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const consider = (shape: Element) => {
    // Skip non-rendered containers *inside* `node`, but not ones `node` itself
    // lives in - a mask child legitimately has a bounding box of its own, and
    // an unconditional `closest()` test made every such box come back empty.
    const container = shape.closest('defs, clipPath, mask');
    if (container && container !== node && node.contains(container)) return;

    const matrix = getCombinedTransformMatrixUntil(shape, node);
    for (const ring of shapeToRings(shape, tolerance)) {
      for (const pt of ring) {
        const [x, y] = applyMatrix(matrix, pt);
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  };

  const selector = 'path, polygon, polyline, line, rect, circle, ellipse';
  if (node.matches?.(selector)) consider(node);
  node.querySelectorAll(selector).forEach(consider);

  if (minX === Infinity) return null;
  const width = maxX - minX;
  const height = maxY - minY;
  if (!(width > 0) || !(height > 0)) return null;

  return { x: minX, y: minY, width, height };
}

/** Maps the unit square onto a bounding box - the `objectBoundingBox` transform. */
function boundingBoxMatrix(box: BoundingBox): Matrix2D {
  return [box.width, 0, 0, box.height, box.x, box.y];
}

/**
 * Parses a length that may be a fraction or a percentage.
 * In `objectBoundingBox` units `-10%` and `-0.1` mean the same thing.
 */
function parseFraction(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const text = value.trim();
  const parsed = text.endsWith('%') ? parseFloat(text) / 100 : parseFloat(text);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * The x/y/width/height region of a `<filter>` or `<mask>`, in user space.
 *
 * Both attributes default to `objectBoundingBox`, not `userSpaceOnUse`, with a
 * default region of -10%/-10%/120%/120%. Requiring an explicit
 * `userSpaceOnUse` - as this used to - silently skipped the region for every
 * file that relied on the default. For a mask that is harmless, because the
 * default region is larger than the object; for the flood rect of a luminosity
 * mask it collapsed the mask to nothing and deleted the artwork.
 */
function explicitRegionRect(el: Element, unitsAttr: string, box: BoundingBox | null): MultiPolygon | null {
  const units = el.getAttribute(unitsAttr) || 'objectBoundingBox';

  if (units === 'userSpaceOnUse') {
    const x = parseFloat(el.getAttribute('x') || '');
    const y = parseFloat(el.getAttribute('y') || '');
    const width = parseFloat(el.getAttribute('width') || '');
    const height = parseFloat(el.getAttribute('height') || '');
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
    return rectRegion(x, y, width, height);
  }

  if (!box) return null;

  const fx = parseFraction(el.getAttribute('x'), -0.1);
  const fy = parseFraction(el.getAttribute('y'), -0.1);
  const fw = parseFraction(el.getAttribute('width'), 1.2);
  const fh = parseFraction(el.getAttribute('height'), 1.2);
  if (!(fw > 0) || !(fh > 0)) return null;

  return rectRegion(
    box.x + fx * box.width,
    box.y + fy * box.height,
    fw * box.width,
    fh * box.height
  );
}

/**
 * The visible region a `<mask>` defines, in the referencing element's space.
 *
 * A real mask multiplies alpha by luminance per pixel, which cannot be
 * expressed as vector geometry. Every mask design tools emit is effectively
 * binary, so it is modelled as one: mask children are painted in document
 * order, a light shape adding to the visible region and a dark shape
 * subtracting from it.
 *
 * The one idiom that needs special handling is Illustrator's "luminosity
 * mask": a child carrying a `<filter>` whose first primitive is
 * `feFlood flood-color="#fff"`. That floods the filter region white *behind*
 * the shape, so a plain black circle becomes "reveal everything except this
 * circle" rather than "reveal nothing". Without it, `PubSub.svg` masks its
 * three connector bars away entirely.
 */
function resolveMaskRegion(
  maskEl: Element,
  referenceMatrix: Matrix2D,
  tolerance: number,
  doc: Document,
  box: BoundingBox | null
): MultiPolygon {
  let visible: MultiPolygon = [];

  // `maskContentUnits` defaults to userSpaceOnUse. Under objectBoundingBox the
  // children are fractions of the box, so `<rect width="1" height="1"/>` means
  // "cover the whole object" - read as user units it is a 1x1 sliver that
  // erases almost everything.
  const contentMatrix =
    (maskEl.getAttribute('maskContentUnits') || 'userSpaceOnUse') === 'objectBoundingBox' && box
      ? multiplyMatrix(referenceMatrix, boundingBoxMatrix(box))
      : referenceMatrix;

  const transformRegion = (region: MultiPolygon): MultiPolygon =>
    region.map(polygon => polygon.map(ring => ring.map(pt => applyMatrix(referenceMatrix, pt))));

  maskEl.querySelectorAll('path, polygon, polyline, rect, circle, ellipse').forEach(shape => {
    const matrix = multiplyMatrix(contentMatrix, getCombinedTransformMatrixUntil(shape, maskEl));

    const filterRef = shape.getAttribute('filter')?.match(/#([^'")\s]+)/);
    if (filterRef) {
      const filterEl = doc.querySelector(`filter[id="${filterRef[1]}"]`);
      const flood = filterEl?.querySelector('feFlood');
      if (filterEl && flood && paintLuminance(flood.getAttribute('flood-color')) >= 0.5) {
        // A filter region is relative to the element the *filter* is applied
        // to - this shape - not to the element referencing the mask, and it
        // lives in that shape's own user space. Using the mask's box and
        // matrix happened to work only because PubSub's filter is
        // userSpaceOnUse on an untransformed child.
        const floodRect = explicitRegionRect(filterEl, 'filterUnits', localBoundingBox(shape, tolerance));
        if (floodRect) {
          const placed = floodRect.map(polygon =>
            polygon.map(ring => ring.map(pt => applyMatrix(matrix, pt)))
          );
          visible = unionMultiPolygons([visible, placed]);
        }
      }
    }

    const rings = shapeToRings(shape, tolerance);
    if (rings.length === 0) return;

    const transformed = rings.map(ring => ring.map(pt => applyMatrix(matrix, pt)));
    const polygons = resolveFilledRegions(transformed, getInheritedFillRule(shape));
    if (polygons.length === 0) return;

    const region = polygonsToMultiPolygon(polygons);
    const luminance = paintLuminance(shape.getAttribute('fill'));

    visible =
      luminance >= 0.5
        ? unionMultiPolygons([visible, region])
        : differenceMultiPolygons(visible, region);
  });

  // Content outside the mask's own region is not rendered at all.
  const maskRect = explicitRegionRect(maskEl, 'maskUnits', box);
  if (maskRect) visible = intersectMultiPolygons([visible, transformRegion(maskRect)]);

  return visible;
}

/**
 * Everything that limits where `el` may paint, together with whether we were
 * able to model all of it.
 *
 * `region: null` means unrestricted. `confident: false` means at least one
 * construct in the chain could not be resolved, which changes how an empty
 * result must be treated - see `resolveVisibility`.
 */
interface Visibility {
  region: MultiPolygon | null;
  confident: boolean;
}

/**
 * Collects every `clip-path` and `mask` applying to `el`, at any depth,
 * intersected into one region in root user space.
 *
 * Nesting **intersects**: a shape inside `<g clip-path="A"><g mask="B">` is
 * visible only where A and B overlap. Walking to the nearest ancestor and
 * stopping - the first version of this - silently ignored the outer one, which
 * is how `Iot-Edge.svg` ended up as a large blue rectangle.
 *
 * Per spec both apply *after* the referencing element's own transform, hence
 * `referenceMatrix x localMatrix`, and `objectBoundingBox` units are fractions
 * of the referencing element's geometry box.
 */
function getVisibilityRegion(el: Element, doc: Document, tolerance: number): Visibility {
  const regions: MultiPolygon[] = [];
  let confident = true;
  let node: Element | null = el;

  while (node && node.tagName.toLowerCase() !== 'svg') {
    const clipRef = node.getAttribute('clip-path')?.match(/#([^'")\s]+)/);
    const maskRef = node.getAttribute('mask')?.match(/#([^'")\s]+)/);

    if (clipRef || maskRef) {
      const referenceMatrix = getCombinedTransformMatrix(node);
      const reference = node;

      // Only paid for when something actually references the box.
      let box: BoundingBox | null | undefined;
      const boxFor = () => (box === undefined ? (box = localBoundingBox(reference, tolerance)) : box);

      if (clipRef) {
        const clipEl = doc.querySelector(`clipPath[id="${clipRef[1]}"]`);
        if (!clipEl) {
          confident = false;
        } else {
          const needsBox = (clipEl.getAttribute('clipPathUnits') || '') === 'objectBoundingBox';
          if (needsBox && !boxFor()) confident = false;
          else regions.push(resolveClipPathRegion(clipEl, referenceMatrix, tolerance, boxFor()));
        }
      }

      if (maskRef) {
        const maskEl = doc.querySelector(`mask[id="${maskRef[1]}"]`);
        if (!maskEl) {
          confident = false;
        } else {
          regions.push(resolveMaskRegion(maskEl, referenceMatrix, tolerance, doc, boxFor()));
        }
      }
    }

    node = node.parentElement;
  }

  if (regions.length === 0) return { region: null, confident };
  if (regions.some(r => r.length === 0)) return { region: [], confident };
  return { region: intersectMultiPolygons(regions), confident };
}

/**
 * Turns a `Visibility` into the region to actually clip against.
 *
 * An empty region means "paints nothing". That is correct only when we
 * understood every construct involved; when we did not, dropping the shape
 * would delete artwork on the strength of a guess. Over-drawing is recoverable
 * and visible, silent deletion is neither - so an unconfident empty result
 * falls back to unrestricted.
 */
function resolveVisibility(visibility: Visibility): MultiPolygon | null {
  if (visibility.region && visibility.region.length === 0 && !visibility.confident) return null;
  return visibility.region;
}

/**
 * Intersects a filled ring with the clip region.
 *
 * Short-circuits when the clip cannot possibly crop the ring, which is the
 * overwhelmingly common case: design tools emit a full-artboard clip on almost
 * every export, and a boolean op there would cost precision and time for no
 * benefit.
 */
function applyClip(ring: Point[], clipRegion: MultiPolygon | null, minHoleArea = 0): Point[][] {
  if (!clipRegion || ring.length < 3) return [ring];
  if (clipRegion.length === 0) return [];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  const clip = multiPolygonBounds(clipRegion);
  const contained =
    minX >= clip.minX - 1e-6 &&
    minY >= clip.minY - 1e-6 &&
    maxX <= clip.maxX + 1e-6 &&
    maxY <= clip.maxY + 1e-6;

  // A containing *bounding box* only proves the clip is a no-op when the clip
  // is a single hole-free rectangle; otherwise the boolean still has to run.
  const clipIsSimpleBox =
    clipRegion.length === 1 && clipRegion[0].length === 1 && clipRegion[0][0].length <= 5;
  if (contained && clipIsSimpleBox) return [ring];

  try {
    return intersectRingWithRegion(ring, clipRegion, minHoleArea);
  } catch {
    return [ring];
  }
}

/** Converts SVG paths, curves, polygons, and shapes into Excalidraw vector elements */
export function parseSvgToExcalidrawElements(
  rawSvg: string,
  targetX: number,
  targetY: number,
  targetWidth: number,
  targetHeight: number,
  groupId: string,
  roughness: number,
  /**
   * Optional out-parameter, filled with a per-reason tally of source shapes
   * that produced no output. Optional and last so the three callers that do
   * not report to a user stay unchanged.
   */
  diagnostics?: ConversionDiagnostics
): ExcalidrawElement[] {
  const noteDrop = (reason: DropReason, tag: string, detail = DROP_REASON_LABELS[reason]) => {
    if (!diagnostics) return;
    diagnostics.skippedTotal += 1;
    const existing = diagnostics.drops.find(
      d => d.reason === reason && d.tag === tag && d.detail === detail
    );
    if (existing) existing.count += 1;
    else diagnostics.drops.push({ reason, tag, count: 1, detail });
  };

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawSvg, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return [];

    // Scale calculation using SVG viewBox
    const viewBoxAttr = svgEl.getAttribute('viewBox');
    let vbX = 0, vbY = 0, vbW = 24, vbH = 24;
    if (viewBoxAttr) {
      const parts = viewBoxAttr.split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
      if (parts.length >= 4) {
        vbX = parts[0];
        vbY = parts[1];
        vbW = parts[2] || 24;
        vbH = parts[3] || 24;
      }
    } else {
      vbW = parseFloat(svgEl.getAttribute('width') || '24') || 24;
      vbH = parseFloat(svgEl.getAttribute('height') || '24') || 24;
    }

    const scale = Math.min(targetWidth / vbW, targetHeight / vbH);
    const offsetX = targetX + (targetWidth - vbW * scale) / 2 - vbX * scale;
    const offsetY = targetY + (targetHeight - vbH * scale) / 2 - vbY * scale;

    /**
     * Curve flattening tolerance, in *user units*, derived from the output
     * size so that the error is constant in pixels no matter what `iconScale`
     * the caller asked for. The old value was a hard-coded 0.05 plus a
     * Ramer-Douglas-Peucker pass at 0.2 user units - 0.8% of a 24-unit
     * artboard - which visibly polygonised every circle and got 2x worse each
     * time the icon was scaled up.
     */
    const flattenTolerance = Math.min(Math.max(CURVE_TOLERANCE_USER_UNITS_AT_1X / scale, 1e-5), 0.05);

    /**
     * Smallest hole worth keeping, in user units squared. Anything under
     * `MIN_VISIBLE_HOLE_AREA_PX` square output pixels cannot be seen, and
     * bridging it would cost a visible corridor (see `regionToBridgedRings`).
     */
    const minHoleArea = MIN_VISIBLE_HOLE_AREA_PX / (scale * scale);

    const styleMap = parseCssStylesheet(doc);
    const rawShapes: RawShape[] = [];

    /** Emits a resolved region as clipped, fill-only shapes. */
    const pushRegion = (
      region: MultiPolygon,
      color: string,
      opacity: number,
      clipRegion: MultiPolygon | null
    ) => {
      if (!color || color === 'transparent') return;
      for (const ring of regionToBridgedRings(region, minHoleArea)) {
        for (const clipped of applyClip(ring, clipRegion, minHoleArea)) {
          if (clipped.length < 3) continue;
          rawShapes.push({
            type: 'line',
            absPoints: clipped as [number, number][],
            fill: color,
            stroke: 'transparent',
            strokeWidth: 0,
            opacity,
          });
        }
      }
    };

    /**
     * Emits a stroke as the *area* it covers rather than as an Excalidraw
     * stroke. See `strokeOutline.ts`: Excalidraw's stroke width is a style
     * property that does not scale with the element, so a stroked icon is only
     * correct at the size it was generated for.
     */
    const pushStroke = (
      subpathsLocal: Point[][],
      closed: boolean,
      style: ReturnType<typeof getShapeStyle>,
      matrix: Matrix2D,
      clipRegion: MultiPolygon | null
    ) => {
      if (style.isStrokeNone) return;
      if (!(style.strokeWidth > 0)) return;

      // Outlined in the element's OWN space, then transformed. A stroke is
      // circular in local space, so under a non-uniform transform its rendered
      // thickness depends on direction - `scale(3 1)` leaves a horizontal
      // line 1 unit thick, not sqrt(3). Collapsing the matrix to one scalar
      // got that wrong for every anisotropic transform.
      const localScale = matrixScale(matrix);
      const region = strokeToRegion(subpathsLocal, closed, {
        width: style.strokeWidth,
        cap: style.lineCap,
        join: style.lineJoin,
        miterLimit: style.miterLimit,
        tolerance: flattenTolerance / (localScale || 1),
      });

      const transformed: MultiPolygon = region.map(polygon =>
        polygon.map(ring => ring.map(pt => applyMatrix(matrix, pt)))
      );

      pushRegion(transformed, style.stroke, style.strokeOpacityPct, clipRegion);
    };

    /**
     * Converts one source element, returning why it drew nothing, or `null`.
     *
     * Extracted from the loop below so the *whole* body sits inside one
     * `try`. It previously did not: `getVisibilityRegion` runs `parsePath`
     * over every `<clipPath>` and `<mask>` in the document, and that throws on
     * malformed or SVGO-minified arc data (`a5 5 0 0110 0` tokenises as one
     * number). Outside the try, a single bad `d` in a clip path escaped to the
     * function-level catch and returned `[]` for the entire file.
     */
    const convertShapeElement = (el: Element): DropReason | null => {
      const producedBefore = rawShapes.length;
      if (el.closest('defs, clipPath, mask')) {
        // `clipPath`/`mask` content is consumed as clip geometry, not dropped;
        // reporting it would bury the real losses under noise from every
        // well-handled export. A bare `<defs>` shape, on the other hand, is
        // only ink if something instantiates it - and `<use>` is not resolved
        // on this path - so that one is a loss worth reporting.
        return el.closest('clipPath, mask') ? null : 'in-defs';
      }

      const tagName = el.tagName.toLowerCase();

      // Everything limiting where this element may paint (clip-path, mask),
      // in root user space. Resolved here rather than in the optimizer because
      // this is where the transform stack and the boolean engine live.
      const clipRegion = resolveVisibility(getVisibilityRegion(el, doc, flattenTolerance));

      if (tagName === 'path') {
        const d = el.getAttribute('d') || '';
        if (!d.trim()) return 'empty-geometry';

        const style = getShapeStyle(el, styleMap, doc);
        if (style.isFillNone && style.isStrokeNone) return 'no-fill-no-stroke';

        const matrix = getCombinedTransformMatrix(el);

        {
          const subpaths = getPointsOnPath(d, flattenTolerance);
          if (subpaths.length === 0) return 'empty-geometry';

          if (!style.isFillNone) {
            // Holes are resolved in *user space*, before the transform is
            // applied, so the fill rule is evaluated against the geometry the
            // author actually wrote. A mirroring transform flips winding,
            // which would otherwise invert every nonzero decision.
            const regions = resolveFilledRegions(subpaths as Point[][], style.fillRule);
            for (const region of regions) {
              const ring = bridgeHoles(region);
              if (ring.length < 3) continue;
              const absPoints: [number, number][] = ring.map(pt => applyMatrix(matrix, pt));
              for (const clipped of applyClip(absPoints, clipRegion, minHoleArea)) {
                if (clipped.length < 3) continue;
                rawShapes.push({
                  type: 'line',
                  absPoints: clipped as [number, number][],
                  fill: style.fill,
                  stroke: 'transparent',
                  strokeWidth: 0,
                  opacity: style.opacity,
                });
              }
            }
          }

          pushStroke(subpaths as Point[][], false, style, matrix, clipRegion);
        }
      } else if (tagName === 'polygon' || tagName === 'polyline') {
        const ptsAttr = el.getAttribute('points') || '';
        const coords = ptsAttr.trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
        if (coords.length < 4) return 'empty-geometry';

        const style = getShapeStyle(el, styleMap, doc);
        if (style.isFillNone && style.isStrokeNone) return 'no-fill-no-stroke';

        const matrix = getCombinedTransformMatrix(el);
        const isClosed = tagName === 'polygon';

        const localPoints: Point[] = [];
        for (let i = 0; i + 1 < coords.length; i += 2) {
          localPoints.push([coords[i], coords[i + 1]]);
        }
        const absPoints: [number, number][] = localPoints.map(pt => applyMatrix(matrix, pt));

        // A `<polyline>` is not filled in SVG unless it declares a fill, and
        // even then its implicit closure only affects the fill, never the
        // stroke.
        if (!style.isFillNone && absPoints.length >= 3) {
          for (const clipped of applyClip(absPoints, clipRegion, minHoleArea)) {
            if (clipped.length < 3) continue;
            rawShapes.push({
              type: 'line',
              absPoints: clipped as [number, number][],
              fill: style.fill,
              stroke: 'transparent',
              strokeWidth: 0,
              opacity: style.opacity,
            });
          }
        }

        pushStroke([localPoints], isClosed, style, matrix, clipRegion);
      } else if (tagName === 'line') {
        const x1 = parseFloat(el.getAttribute('x1') || '0');
        const y1 = parseFloat(el.getAttribute('y1') || '0');
        const x2 = parseFloat(el.getAttribute('x2') || '0');
        const y2 = parseFloat(el.getAttribute('y2') || '0');

        const style = getShapeStyle(el, styleMap, doc);
        // A `<line>` is never filled in SVG; with no stroke it paints nothing.
        if (style.isStrokeNone) return 'no-fill-no-stroke';

        const matrix = getCombinedTransformMatrix(el);
        pushStroke([[[x1, y1], [x2, y2]]], false, style, matrix, clipRegion);
      } else if (tagName === 'rect') {
        const x = parseFloat(el.getAttribute('x') || '0');
        const y = parseFloat(el.getAttribute('y') || '0');
        const w = parseFloat(el.getAttribute('width') || '0');
        const h = parseFloat(el.getAttribute('height') || '0');
        if (!(w > 0) || !(h > 0)) return 'degenerate';

        // Per spec an omitted rx/ry mirrors the other, and both clamp to half
        // the corresponding side.
        const rxAttr = el.getAttribute('rx');
        const ryAttr = el.getAttribute('ry');
        const rxRaw = rxAttr !== null ? parseFloat(rxAttr) : ryAttr !== null ? parseFloat(ryAttr) : 0;
        const ryRaw = ryAttr !== null ? parseFloat(ryAttr) : rxRaw;
        const rx = Math.min(Math.max(Number.isFinite(rxRaw) ? rxRaw : 0, 0), w / 2);
        const ry = Math.min(Math.max(Number.isFinite(ryRaw) ? ryRaw : 0, 0), h / 2);

        const style = getShapeStyle(el, styleMap, doc);
        if (style.isFillNone && style.isStrokeNone) return 'no-fill-no-stroke';

        const matrix = getCombinedTransformMatrix(el);

        // Only a rect whose radii reach both half-extents is actually an
        // ellipse. The old `maxR >= min(w, h) / 2.2` guess turned every pill
        // (e.g. `5x2 rx=1`) into a full ellipse, losing its flat sides.
        const isEllipse = rx >= w / 2 - 1e-6 && ry >= h / 2 - 1e-6;
        if (isEllipse && !style.isFillNone) {
          const centerTransformed = applyMatrix(matrix, [x + w / 2, y + h / 2]);
          rawShapes.push({
            type: 'ellipse',
            cx: centerTransformed[0],
            cy: centerTransformed[1],
            rx: (w / 2) * Math.hypot(matrix[0], matrix[1]),
            ry: (h / 2) * Math.hypot(matrix[2], matrix[3]),
            fill: style.fill,
            stroke: 'transparent',
            strokeWidth: 0,
            opacity: style.opacity,
          });
        }

        const localRing = rectangleRing(x, y, w, h, rx, ry, flattenTolerance);
        const ring = localRing.map((pt: Point) => applyMatrix(matrix, pt));

        if (!isEllipse && !style.isFillNone) {
          for (const clipped of applyClip(ring, clipRegion, minHoleArea)) {
            if (clipped.length < 3) continue;
            rawShapes.push({
              type: 'line',
              absPoints: clipped as [number, number][],
              // A filled rect is filled - it does not get a fabricated outline
              // in its own fill colour. That hack existed to keep sub-pixel
              // bars visible back when stroke widths were unscaled.
              fill: style.fill,
              stroke: 'transparent',
              strokeWidth: 0,
              opacity: style.opacity,
            });
          }
        }

        pushStroke([localRing], true, style, matrix, clipRegion);
      } else if (tagName === 'circle' || tagName === 'ellipse') {
        let cx = 0, cy = 0, rx = 0, ry = 0;
        if (tagName === 'circle') {
          cx = parseFloat(el.getAttribute('cx') || '0');
          cy = parseFloat(el.getAttribute('cy') || '0');
          rx = ry = parseFloat(el.getAttribute('r') || '0');
        } else {
          cx = parseFloat(el.getAttribute('cx') || '0');
          cy = parseFloat(el.getAttribute('cy') || '0');
          rx = parseFloat(el.getAttribute('rx') || '0');
          ry = parseFloat(el.getAttribute('ry') || '0');
        }
        if (!(rx > 0) || !(ry > 0)) return 'degenerate';

        const style = getShapeStyle(el, styleMap, doc);
        if (style.isFillNone && style.isStrokeNone) return 'no-fill-no-stroke';

        const matrix = getCombinedTransformMatrix(el);

        if (!style.isFillNone) {
          const centerTransformed = applyMatrix(matrix, [cx, cy]);
          rawShapes.push({
            type: 'ellipse',
            cx: centerTransformed[0],
            cy: centerTransformed[1],
            rx: rx * Math.hypot(matrix[0], matrix[1]),
            ry: ry * Math.hypot(matrix[2], matrix[3]),
            fill: style.fill,
            // The stroke is emitted separately as an annulus so that it scales
            // with the element; an Excalidraw stroke would not.
            stroke: 'transparent',
            strokeWidth: 0,
            opacity: style.opacity,
          });
        }

        if (!style.isStrokeNone) {
          const localRing = shapeToRings(el, flattenTolerance)[0];
          if (localRing) pushStroke([localRing], true, style, matrix, clipRegion);
        }
      }

      // Passed every guard and still painted nothing. The distinction matters:
      // "clipped away" is usually an unsupported clip/mask idiom on our side,
      // "degenerate" is usually a collapsed transform or a sub-pixel shape.
      if (rawShapes.length === producedBefore) {
        return clipRegion ? 'clipped-away' : 'degenerate';
      }
      return null;
    };

    doc.querySelectorAll('path, polygon, polyline, line, rect, circle, ellipse').forEach(el => {
      try {
        const reason = convertShapeElement(el);
        if (reason) noteDrop(reason, el.tagName.toLowerCase());
      } catch (err) {
        console.warn(`Shape conversion warning (<${el.tagName.toLowerCase()}>):`, err);
        noteDrop('parse-error', el.tagName.toLowerCase(), err instanceof Error ? err.message : String(err));
      }
    });

    // Deduplicate identical shapes
    const seenShapes = new Set<string>();
    const uniqueRawShapes: RawShape[] = [];

    rawShapes.forEach(shape => {
      if (shape.fill === 'transparent' && shape.stroke === 'transparent') return;
      const key = `${shape.type}_${shape.fill}_${shape.stroke}_${JSON.stringify(shape.absPoints || [shape.cx, shape.cy, shape.rx, shape.ry])}`;
      if (!seenShapes.has(key)) {
        seenShapes.add(key);
        uniqueRawShapes.push(shape);
      }
    });

    if (uniqueRawShapes.length === 0) return [];

    /**
     * Drops a full-artboard background plate, which design tools emit on
     * almost every export and which would otherwise paste as an opaque slab
     * over whatever the user already had on the canvas.
     *
     * Two conditions, and both are necessary.
     *
     * The bounds test is expressed as a fraction of the *actual* viewBox. It
     * used to be the literal constants `0.5` and `23.5`, hard-coded for a 24x24
     * artboard and compared against root user-space coordinates - so on a
     * `viewBox="0 0 32 32"` file, `23.5` sat at 73% of the width and any shape
     * reaching that far was treated as a background.
     *
     * The solidity test is what stops the filter from eating artwork. Spanning
     * the artboard does not make something a background: a silhouette logo
     * spans it too. A background *plate* is solid - it fills essentially all of
     * its own bounding box - whereas real artwork does not. The reported
     * squirrel line-art measured 0.245 here, a rectangle measures 1.0, and a
     * full-artboard ellipse measures pi/4 = 0.785.
     */
    let activeShapes = uniqueRawShapes;
    if (activeShapes.length > 1) {
      const marginX = vbW * ARTBOARD_MARGIN_FRACTION;
      const marginY = vbH * ARTBOARD_MARGIN_FRACTION;

      const contentShapes = activeShapes.filter(shape => {
        let sMinX = Infinity, sMinY = Infinity, sMaxX = -Infinity, sMaxY = -Infinity;
        let solidity = 0;

        if (shape.type === 'line' && shape.absPoints) {
          shape.absPoints.forEach(([x, y]) => {
            sMinX = Math.min(sMinX, x);
            sMinY = Math.min(sMinY, y);
            sMaxX = Math.max(sMaxX, x);
            sMaxY = Math.max(sMaxY, y);
          });
          const boxArea = (sMaxX - sMinX) * (sMaxY - sMinY);
          solidity = boxArea > 0 ? Math.abs(signedArea(shape.absPoints)) / boxArea : 0;
        } else if (shape.type === 'ellipse' && shape.cx !== undefined && shape.rx !== undefined) {
          sMinX = shape.cx - shape.rx;
          sMinY = shape.cy! - shape.ry!;
          sMaxX = shape.cx + shape.rx;
          sMaxY = shape.cy! + shape.ry!;
          solidity = Math.PI / 4;
        }

        const spansArtboard =
          sMinX <= vbX + marginX &&
          sMinY <= vbY + marginY &&
          sMaxX >= vbX + vbW - marginX &&
          sMaxY >= vbY + vbH - marginY;

        return !(spansArtboard && solidity >= BACKGROUND_PLATE_SOLIDITY);
      });
      if (contentShapes.length > 0) activeShapes = contentShapes;
    }

    // NOTE: there is deliberately no "open path with a fill becomes a stroke"
    // fixup here any more. Every stroke is now emitted as the area it covers
    // (see `pushStroke`), so no shape reaching this point is an open path.

    /**
     * Stroke widths arrive in user units already multiplied by their element
     * transform; the remaining factor is the viewBox -> target fit. Excalidraw
     * takes an arbitrary number here, so no rounding: a 0.5-unit hairline on a
     * 24-unit artboard drawn at 48px is genuinely 1px, and a `stroke-width="2"`
     * is genuinely 4px.
     */
    const toOutputStrokeWidth = (userUnits: number | undefined, fit: number): number =>
      Math.max(Number((((userUnits ?? 1) * fit) || fit).toFixed(3)), MIN_STROKE_WIDTH);

    const elements: ExcalidrawElement[] = [];

    activeShapes.forEach(shape => {
      if (shape.type === 'ellipse' && shape.cx !== undefined && shape.cy !== undefined && shape.rx !== undefined && shape.ry !== undefined) {
        const elX = Number((offsetX + (shape.cx - shape.rx) * scale).toFixed(2));
        const elY = Number((offsetY + (shape.cy - shape.ry) * scale).toFixed(2));
        const elW = Number((shape.rx * 2 * scale).toFixed(2));
        const elH = Number((shape.ry * 2 * scale).toFixed(2));
        const strokeColor = (shape.stroke && shape.stroke !== 'transparent') ? shape.stroke : 'transparent';

        elements.push(createBaseElement('ellipse', elX, elY, Math.max(elW, 2), Math.max(elH, 2), groupId, {
          strokeColor,
          backgroundColor: shape.fill,
          strokeWidth: toOutputStrokeWidth(shape.strokeWidth, scale),
          roughness,
          opacity: shape.opacity,
        }));
      } else if (shape.type === 'line' && shape.absPoints && shape.absPoints.length >= 2) {
        // Excalidraw only fills closed loops, so any ring carrying a fill has
        // to explicitly return to its starting point.
        const wantsFill = !!shape.fill && shape.fill !== 'transparent';
        const absPoints = wantsFill ? closeRing(shape.absPoints) : shape.absPoints;

        let sMinX = Infinity, sMinY = Infinity, sMaxX = -Infinity, sMaxY = -Infinity;
        absPoints.forEach(([x, y]) => {
          sMinX = Math.min(sMinX, x);
          sMinY = Math.min(sMinY, y);
          sMaxX = Math.max(sMaxX, x);
          sMaxY = Math.max(sMaxY, y);
        });

        const elX = Number((offsetX + sMinX * scale).toFixed(2));
        const elY = Number((offsetY + sMinY * scale).toFixed(2));
        const elW = Number(((sMaxX - sMinX) * scale).toFixed(2));
        const elH = Number(((sMaxY - sMinY) * scale).toFixed(2));

        const relPoints: [number, number][] = absPoints.map(([x, y]) => [
          Number(((x - sMinX) * scale).toFixed(2)),
          Number(((y - sMinY) * scale).toFixed(2)),
        ]);

        const strokeColor = (shape.stroke && shape.stroke !== 'transparent') ? shape.stroke : 'transparent';

        elements.push(createBaseElement('line', elX, elY, Math.max(elW, 1), Math.max(elH, 1), groupId, {
          strokeColor,
          backgroundColor: shape.fill,
          strokeWidth: toOutputStrokeWidth(shape.strokeWidth, scale),
          roughness,
          opacity: shape.opacity,
          points: relPoints,
        }));
      }
    });

    return elements;
  } catch (err) {
    console.error('Vector parsing error:', err);
    return [];
  }
}

export interface ItemLayout {
  cardWidth: number;
  cardHeight: number;
  iconWidth: number;
  iconHeight: number;
  labelWidth: number;
  labelHeight: number;
  /** Offsets from the item origin, not absolute coordinates. */
  iconDx: number;
  iconDy: number;
  labelDx: number;
  labelDy: number;
}

/** Gap between the artwork and the label, in canvas units. */
const LABEL_GAP_STACKED = 8;
const LABEL_GAP_BESIDE = 12;

/** Axis-aligned bounding box of a set of elements, in absolute scene units. */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Ink box of converted artwork.
 *
 * Every element this converter emits carries an exact `x`/`y`/`width`/`height`
 * derived from its own absolute point extents, and `strokeColor` is always
 * transparent (see ARCHITECTURE.md §3), so a plain union of those rectangles
 * *is* the ink box - there is no stroke extent to add back.
 *
 * Returns `null` for an empty scene so callers can tell "no artwork" apart
 * from "artwork of zero size" and fall back to the nominal box.
 */
export function elementsBounds(elements: ExcalidrawElement[]): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    if (el.isDeleted) continue;
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);
  }

  if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) return null;

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Size and internal offsets of one item, independent of where it is placed.
 *
 * Split out of `createExcalidrawItem` so the grid packers can ask how big an
 * item is *before* choosing its position. They used to assume a fixed 160/180
 * unit pitch, which silently overlapped neighbours as soon as a card grew -
 * long service names and any `iconScale` above 1 both did it.
 *
 * `artworkSize` overrides the nominal `ICON_BASE_SIZE * iconScale` square, and
 * is how `fitFrame` works: the caller converts first, measures the real ink,
 * and passes it back in. Left out, the result is the nominal layout - which is
 * what `gridPitch` wants, and what keeps this callable from a filename alone.
 */
export function measureExcalidrawItem(
  icon: IconAsset,
  options: ExcalidrawOptions,
  artworkSize?: { width: number; height: number }
): ItemLayout {
  const nominal = Math.round(ICON_BASE_SIZE * options.iconScale);
  const iconWidth = artworkSize ? artworkSize.width : nominal;
  const iconHeight = artworkSize ? artworkSize.height : nominal;
  const padding = options.showCard ? options.padding : 0;

  // Measured against the real font's advance widths rather than estimated from
  // the character count. Excalidraw does not re-measure pasted text, so the
  // number written here is the one the card is sized around forever.
  const label = options.showLabel
    ? measureLabel(icon.title, options.labelFontFamily, options.labelFontSize)
    : { width: 0, height: 0 };
  const labelWidth = label.width;
  const labelHeight = label.height;

  let cardWidth: number;
  let cardHeight: number;
  let iconDx: number;
  let iconDy: number;
  let labelDx: number;
  let labelDy: number;

  if (options.labelPosition === 'right') {
    const gap = options.showLabel ? LABEL_GAP_BESIDE : 0;
    cardWidth = iconWidth + (options.showLabel ? labelWidth + gap : 0) + padding * 2;
    cardHeight = Math.max(iconHeight, labelHeight) + padding * 2;
    iconDx = padding;
    iconDy = (cardHeight - iconHeight) / 2;
    labelDx = padding + iconWidth + gap;
    labelDy = (cardHeight - labelHeight) / 2;
  } else if (options.labelPosition === 'top') {
    const gap = options.showLabel ? LABEL_GAP_STACKED : 0;
    cardWidth = Math.max(iconWidth, labelWidth) + padding * 2;
    cardHeight = iconHeight + padding * 2 + (options.showLabel ? labelHeight + gap : 0);
    labelDx = (cardWidth - labelWidth) / 2;
    labelDy = padding;
    iconDx = (cardWidth - iconWidth) / 2;
    iconDy = padding + (options.showLabel ? labelHeight + gap : 0);
  } else {
    const gap = options.showLabel ? LABEL_GAP_STACKED : 0;
    cardWidth = Math.max(iconWidth, labelWidth) + padding * 2;
    cardHeight = iconHeight + padding * 2 + (options.showLabel ? labelHeight + gap : 0);
    iconDx = (cardWidth - iconWidth) / 2;
    iconDy = padding;
    labelDx = (cardWidth - labelWidth) / 2;
    labelDy = padding + iconHeight + gap;
  }

  return {
    cardWidth,
    cardHeight,
    iconWidth,
    iconHeight,
    labelWidth,
    labelHeight,
    iconDx,
    iconDy,
    labelDx,
    labelDy,
  };
}

/** Grows a box to the nearest whole units on every side. */
function snapOutward(bounds: Bounds | null): Bounds | null {
  if (!bounds) return null;

  const x = Math.floor(bounds.x);
  const y = Math.floor(bounds.y);

  return {
    x,
    y,
    width: Math.ceil(bounds.x + bounds.width) - x,
    height: Math.ceil(bounds.y + bounds.height) - y,
  };
}

/**
 * The box a frame is sized around, or `null` to use the nominal icon square.
 *
 * Exported because the grid preview needs the identical answer. The preview
 * has already converted the icon in order to render it, so it can measure the
 * same ink the exporter will - but only if it measures it the *same way*.
 * Reimplementing "bounds, snapped outward" on the UI side is how a preview
 * starts disagreeing with its export by a unit or two under `fitFrame`.
 *
 * Snapped outward rather than rounded: ink bounds are arbitrary floats, and
 * feeding them straight into the layout produced cards like 96.06 x 127.01,
 * which made every derived offset fractional and pushed the artwork half a
 * unit off centre once positions were rounded. Expanding guarantees the frame
 * still contains all of the ink.
 */
export function inkBoxFor(
  elements: ExcalidrawElement[],
  options: ExcalidrawOptions
): Bounds | null {
  if (!options.fitFrame) return null;
  return snapOutward(elementsBounds(elements));
}

/** Shifts elements in place. */
function translateElements(elements: ExcalidrawElement[], dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  for (const el of elements) {
    el.x += dx;
    el.y += dy;
  }
}

export function createExcalidrawItem(
  icon: IconAsset,
  options: ExcalidrawOptions,
  baseX = 0,
  baseY = 0
): { elements: ExcalidrawElement[]; files: Record<string, ExcalidrawFile> } {
  const elements: ExcalidrawElement[] = [];
  const files: Record<string, ExcalidrawFile> = {};
  const groupId = generateRandomId();

  const nominalSize = Math.round(ICON_BASE_SIZE * options.iconScale);

  // 1. Convert the artwork first, at the origin.
  //
  // The layout depends on the result when `fitFrame` is on, so this has to run
  // before anything is measured or placed. It is still exactly one conversion
  // per item: the elements are translated into position afterwards rather than
  // being re-converted at an offset.
  //
  // An embedded image is the last resort, not a user-selectable mode: a bitmap
  // is not editable, not restyleable and not what this project is for. It
  // survives purely so a file the converter cannot handle still pastes as
  // *something* visible rather than vanishing.
  const vectorElements = parseSvgToExcalidrawElements(
    icon.rawSvg,
    0,
    0,
    nominalSize,
    nominalSize,
    groupId,
    options.iconRoughness
  );

  /*
   * 2. Decide what the frame is being sized around.
   *
   * The nominal box is the source viewBox scaled to fit, so it includes any
   * padding the author baked into the file, and letterboxes anything that is
   * not square (`parseSvgToExcalidrawElements` fits with `Math.min` of the two
   * ratios and centres). That dead space is the gap between "the icon is
   * accurate" and "the frame is not".
   *
   * `fitFrame` closes it by measuring the ink that was actually produced. The
   * artwork itself is untouched - same conversion, same scale, same fidelity -
   * only the box drawn around it changes.
   */
  const ink = inkBoxFor(vectorElements, options);
  const artwork = ink
    ? { width: ink.width, height: ink.height }
    : { width: nominalSize, height: nominalSize };

  const layout = measureExcalidrawItem(icon, options, artwork);
  const { cardWidth, cardHeight, labelWidth, labelHeight } = layout;
  const labelText = icon.title;

  const iconX = Math.round(baseX + layout.iconDx);
  const iconY = Math.round(baseY + layout.iconDy);
  const labelX = Math.round(baseX + layout.labelDx);
  const labelY = Math.round(baseY + layout.labelDy);

  // 3. Frame rectangle.
  //
  // Every property is taken from the options rather than implied by a named
  // style. In particular `backgroundColor` is applied unconditionally: the old
  // `outline` style forced it to transparent, so the background swatch did
  // nothing whenever outline was selected.
  if (options.showCard) {
    elements.push(createBaseElement('rectangle', baseX, baseY, cardWidth, cardHeight, groupId, {
      index: 'a0',
      strokeColor: options.cardStrokeColor,
      backgroundColor: options.cardBgColor,
      fillStyle: options.cardFillStyle,
      strokeWidth: options.cardStrokeWidth,
      roughness: options.cardRoughness,
      // Excalidraw's `getCornerRadius` gives `shorterSide * 0.25` below 128
      // units, which is the rounding people expect from a card.
      roundness: options.cardCorners === 'rounded' ? { type: 3 } : null,
    }));
  }

  // 4. Artwork, moved into place.
  if (vectorElements.length > 0) {
    // Under `fitFrame` the ink box is what was positioned, so the offset is
    // measured from the ink's own origin rather than from the nominal box.
    translateElements(vectorElements, iconX - (ink?.x ?? 0), iconY - (ink?.y ?? 0));
    elements.push(...vectorElements);
  } else {
    const fileId = generateRandomId();
    files[fileId] = { mimeType: 'image/svg+xml', id: fileId, dataURL: icon.dataUrl, created: Date.now() };

    elements.push(createBaseElement('image', iconX, iconY, artwork.width, artwork.height, groupId, {
      fileId,
      scale: [1, 1],
      status: 'saved',
    }));
  }

  // 5. Label.
  if (options.showLabel) {
    elements.push(createBaseElement('text', labelX, labelY, labelWidth, labelHeight, groupId, {
      index: 'a2',
      strokeColor: options.labelColor,
      text: labelText,
      originalText: labelText,
      fontSize: options.labelFontSize,
      fontFamily: options.labelFontFamily,
      textAlign: 'center',
      verticalAlign: 'top',
      containerId: null,
      // This font's real line height, not a constant. `restoreElement` only
      // back-solves one from the supplied height when the field is absent, and
      // its guess disagrees with the font for everything except Excalifont.
      lineHeight: lineHeightFor(options.labelFontFamily),
    }));
  }

  return { elements, files };
}

/**
 * Column/row pitch that fits the largest item in the set, plus a gutter.
 *
 * Replaces the old fixed 160/180 constants, which were sized for a 48px icon
 * with a short label and overlapped as soon as either grew.
 */
/**
 * Exported for the fidelity harness, which needs the pitch *before* it has
 * converted anything: `measureExcalidrawItem` reads only `icon.title` and the
 * options, so the layout can be computed from filenames alone and handed to
 * worker processes that each own one slice of the corpus.
 *
 * Always measures the *nominal* artwork box, so the answer never depends on a
 * conversion. Labels are measured exactly, which removes the axis that
 * actually used to overlap - long titles against a pitch that ignored them.
 *
 * This is an estimate, not a bound, and the packers below no longer rely on
 * it. Two things can make a real item exceed it: `fitFrame`, which is measured
 * from ink this function has not seen, and source artwork drawn outside its
 * own `viewBox`. A browser clips the latter to the viewport and this converter
 * does not, so `Iot-Edge.svg` genuinely produces geometry 12 units past the
 * edge of its 96-unit box.
 */
export function gridPitch(
  icons: IconAsset[],
  options: ExcalidrawOptions,
  gutter: number
): { pitchX: number; pitchY: number } {
  let widest = 0;
  let tallest = 0;

  for (const icon of icons) {
    const { cardWidth, cardHeight } = measureExcalidrawItem(icon, options);
    if (cardWidth > widest) widest = cardWidth;
    if (cardHeight > tallest) tallest = cardHeight;
  }

  return { pitchX: Math.ceil(widest) + gutter, pitchY: Math.ceil(tallest) + gutter };
}

interface PackedItem {
  icon: IconAsset;
  elements: ExcalidrawElement[];
  files: Record<string, ExcalidrawFile>;
}

/**
 * Builds every item and lays them out on a grid sized to what they measure.
 *
 * Two passes over one conversion each: build at the origin, take each item's
 * real extent, then translate into a cell. Deriving the pitch from the built
 * items rather than from `gridPitch` is what makes the packing exact - an item
 * can be larger than the nominal estimate for two reasons that no
 * pre-conversion measurement can see. `fitFrame` sizes the frame from ink, and
 * source artwork is not clipped to its own `viewBox`, so a file that draws
 * outside it (`Iot-Edge.svg` does, by 12 units) used to overlap its neighbour.
 *
 * Cells are aligned on each item's measured bounds rather than on its
 * nominal origin, so the escaping case is centred in its cell instead of
 * hanging out of one corner. For the 259 icons that stay inside their viewBox
 * the two are the same point and nothing moves.
 */
function packGrid(
  icons: IconAsset[],
  options: ExcalidrawOptions,
  gutter: number,
  columns: number
): PackedItem[] {
  const built = icons.map(icon => ({ icon, ...createExcalidrawItem(icon, options, 0, 0) }));
  const boxes = built.map(item => elementsBounds(item.elements));

  let widest = 0;
  let tallest = 0;
  for (const box of boxes) {
    if (!box) continue;
    if (box.width > widest) widest = box.width;
    if (box.height > tallest) tallest = box.height;
  }

  const pitchX = Math.ceil(widest) + gutter;
  const pitchY = Math.ceil(tallest) + gutter;

  built.forEach((item, idx) => {
    const box = boxes[idx];
    if (!box) return;
    const col = idx % columns;
    const row = Math.floor(idx / columns);
    translateElements(item.elements, col * pitchX - box.x, row * pitchY - box.y);
  });

  return built;
}

export function buildExcalidrawLibraryPackage(icons: IconAsset[], options: ExcalidrawOptions): ExcalidrawLibraryPackage {
  const allFiles: Record<string, ExcalidrawFile> = {};

  const libraryItems = packGrid(icons, options, 32, 10).map(({ icon, elements, files }) => {
    // `files` used to be discarded here. When vector conversion yields nothing,
    // `createExcalidrawItem` falls back to an `image` element whose bitmap
    // lives in `files` - dropping the map left a library item pointing at a
    // `fileId` that does not exist, which Excalidraw renders as an empty box.
    Object.assign(allFiles, files);

    return {
      id: generateRandomId(),
      status: 'published' as const,
      created: Date.now(),
      name: icon.title,
      elements,
      ...(Object.keys(files).length > 0 ? { files } : {}),
    };
  });

  // Carried both per-item and at the top level: the `.excalidrawlib` v2 schema
  // is not explicit about where files belong, and different Excalidraw builds
  // have looked in either place.
  return {
    type: 'excalidrawlib',
    version: 2,
    libraryItems,
    ...(Object.keys(allFiles).length > 0 ? { files: allFiles } : {}),
  };
}

export function buildExcalidrawClipboardData(
  icons: IconAsset[],
  options: ExcalidrawOptions
): { jsonText: string; excalidrawClipboardJson: string } {
  let allElements: ExcalidrawElement[] = [];
  const allFiles: Record<string, ExcalidrawFile> = {};

  for (const { elements, files } of packGrid(icons, options, 24, 8)) {
    allElements = allElements.concat(elements);
    Object.assign(allFiles, files);
  }

  const payload = {
    type: 'excalidraw/clipboard',
    elements: allElements,
    files: allFiles,
  };

  return {
    jsonText: JSON.stringify(payload, null, 2),
    excalidrawClipboardJson: JSON.stringify(payload),
  };
}
