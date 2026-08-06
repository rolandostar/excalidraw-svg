import * as pointsOnPathModule from 'points-on-path';
import {
  GCPIcon,
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
  unionMultiPolygons,
} from './pathRegions';
import { LineCap, LineJoin, strokeToRegion } from './strokeOutline';

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
  }
  const fillOpacity = readOpacity(el.getAttribute('fill-opacity'));
  const strokeOpacity = readOpacity(el.getAttribute('stroke-opacity'));
  let strokeWidthStr: string | null = null;

  let ancestor: Element | null = el.parentElement;
  while (ancestor && ancestor.tagName.toLowerCase() !== 'svg') {
    if (!fill) fill = ancestor.getAttribute('fill');
    if (!stroke) stroke = ancestor.getAttribute('stroke');
    if (!strokeWidthStr) strokeWidthStr = ancestor.getAttribute('stroke-width');
    ancestor = ancestor.parentElement;
  }

  const className = el.getAttribute('class');
  if (className) {
    className.split(/\s+/).forEach(c => {
      if (styleMap[c]) {
        if (!fill && styleMap[c].fill) fill = styleMap[c].fill;
        if (!stroke && styleMap[c].stroke) stroke = styleMap[c].stroke;
        if (styleMap[c].opacity !== undefined) groupOpacity *= readOpacity(String(styleMap[c].opacity));
      }
    });
  }

  const elStrokeWidth = el.getAttribute('stroke-width');
  if (elStrokeWidth) strokeWidthStr = elStrokeWidth;

  const styleAttr = el.getAttribute('style');
  if (styleAttr) {
    const fillMatch = styleAttr.match(/fill\s*:\s*([^;\}]+)/i);
    if (fillMatch) fill = fillMatch[1].trim();
    const strokeMatch = styleAttr.match(/stroke\s*:\s*([^;\}]+)/i);
    if (strokeMatch) stroke = strokeMatch[1].trim();
    const opacityMatch = styleAttr.match(/(?:^|[;\s])opacity\s*:\s*([^;\}]+)/i);
    if (opacityMatch) groupOpacity = readOpacity(opacityMatch[1]);
    const swMatch = styleAttr.match(/stroke-width\s*:\s*([^;\}]+)/i);
    if (swMatch) strokeWidthStr = swMatch[1].trim();
  }

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

  const isFillNone = !fill || fill === 'none' || fill === 'transparent';
  const isStrokeNone = !stroke || stroke === 'none' || stroke === 'transparent';

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
function resolveClipPathRegion(clipEl: Element, referenceMatrix: Matrix2D, tolerance: number): MultiPolygon {
  const regions: MultiPolygon[] = [];

  clipEl.querySelectorAll('path, polygon, polyline, rect, circle, ellipse').forEach(shape => {
    const matrix = multiplyMatrix(referenceMatrix, getCombinedTransformMatrixUntil(shape, clipEl));
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

/** `userSpaceOnUse` x/y/width/height of a `<filter>` or `<mask>`, if fully specified. */
function explicitRegionRect(el: Element, unitsAttr: string): MultiPolygon | null {
  if ((el.getAttribute(unitsAttr) || '') !== 'userSpaceOnUse') return null;
  const x = parseFloat(el.getAttribute('x') || '');
  const y = parseFloat(el.getAttribute('y') || '');
  const width = parseFloat(el.getAttribute('width') || '');
  const height = parseFloat(el.getAttribute('height') || '');
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return rectRegion(x, y, width, height);
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
  doc: Document
): MultiPolygon {
  let visible: MultiPolygon = [];

  const transformRegion = (region: MultiPolygon): MultiPolygon =>
    region.map(polygon => polygon.map(ring => ring.map(pt => applyMatrix(referenceMatrix, pt))));

  maskEl.querySelectorAll('path, polygon, polyline, rect, circle, ellipse').forEach(shape => {
    const filterRef = shape.getAttribute('filter')?.match(/#([^'")\s]+)/);
    if (filterRef) {
      const filterEl = doc.querySelector(`filter[id="${filterRef[1]}"]`);
      const flood = filterEl?.querySelector('feFlood');
      if (filterEl && flood && paintLuminance(flood.getAttribute('flood-color')) >= 0.5) {
        const floodRect = explicitRegionRect(filterEl, 'filterUnits');
        if (floodRect) visible = unionMultiPolygons([visible, transformRegion(floodRect)]);
      }
    }

    const matrix = multiplyMatrix(referenceMatrix, getCombinedTransformMatrixUntil(shape, maskEl));
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
  const maskRect = explicitRegionRect(maskEl, 'maskUnits');
  if (maskRect) visible = intersectMultiPolygons([visible, transformRegion(maskRect)]);

  return visible;
}

/**
 * Every region that limits where `el` may paint - `clip-path` and `mask`, at
 * any depth - intersected into one.
 *
 * Nesting **intersects**: a shape inside `<g clip-path="A"><g mask="B">` is
 * visible only where A and B overlap. Walking to the nearest ancestor and
 * stopping - the first version of this - silently ignored the outer one, which
 * is how `Iot-Edge.svg` ended up as a large blue rectangle.
 *
 * Per spec both apply *after* the referencing element's own transform, hence
 * `referenceMatrix x localMatrix`. `objectBoundingBox` units are not modelled;
 * such a reference is ignored rather than guessed at.
 */
function getVisibilityRegion(el: Element, doc: Document, tolerance: number): MultiPolygon | null {
  const regions: MultiPolygon[] = [];
  let node: Element | null = el;

  while (node && node.tagName.toLowerCase() !== 'svg') {
    const referenceMatrix = getCombinedTransformMatrix(node);

    const clipRef = node.getAttribute('clip-path')?.match(/#([^'")\s]+)/);
    if (clipRef) {
      const clipEl = doc.querySelector(`clipPath[id="${clipRef[1]}"]`);
      if (clipEl && (clipEl.getAttribute('clipPathUnits') || 'userSpaceOnUse') === 'userSpaceOnUse') {
        regions.push(resolveClipPathRegion(clipEl, referenceMatrix, tolerance));
      }
    }

    const maskRef = node.getAttribute('mask')?.match(/#([^'")\s]+)/);
    if (maskRef) {
      const maskEl = doc.querySelector(`mask[id="${maskRef[1]}"]`);
      if (maskEl) regions.push(resolveMaskRegion(maskEl, referenceMatrix, tolerance, doc));
    }

    node = node.parentElement;
  }

  if (regions.length === 0) return null;
  // An empty region hides everything; record it so the shape is correctly
  // dropped rather than silently left unclipped.
  if (regions.some(r => r.length === 0)) return [];
  return intersectMultiPolygons(regions);
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
  roughness: number
): ExcalidrawElement[] {
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

    doc.querySelectorAll('path, polygon, polyline, line, rect, circle, ellipse').forEach(el => {
      if (el.closest('defs, clipPath, mask')) return;

      const tagName = el.tagName.toLowerCase();

      // Everything limiting where this element may paint (clip-path, mask),
      // in root user space. Resolved here rather than in the optimizer because
      // this is where the transform stack and the boolean engine live.
      const clipRegion = getVisibilityRegion(el, doc, flattenTolerance);

      if (tagName === 'path') {
        const d = el.getAttribute('d') || '';
        if (!d.trim()) return;

        const style = getShapeStyle(el, styleMap, doc);
        if (style.isFillNone && style.isStrokeNone) return;

        const matrix = getCombinedTransformMatrix(el);

        try {
          const subpaths = getPointsOnPath(d, flattenTolerance);
          if (subpaths.length === 0) return;

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
        } catch (err) {
          console.warn('Path parsing warning:', err);
        }
      } else if (tagName === 'polygon' || tagName === 'polyline') {
        const ptsAttr = el.getAttribute('points') || '';
        const coords = ptsAttr.trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
        if (coords.length < 4) return;

        const style = getShapeStyle(el, styleMap, doc);
        if (style.isFillNone && style.isStrokeNone) return;

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
        if (style.isStrokeNone) return;

        const matrix = getCombinedTransformMatrix(el);
        pushStroke([[[x1, y1], [x2, y2]]], false, style, matrix, clipRegion);
      } else if (tagName === 'rect') {
        const x = parseFloat(el.getAttribute('x') || '0');
        const y = parseFloat(el.getAttribute('y') || '0');
        const w = parseFloat(el.getAttribute('width') || '0');
        const h = parseFloat(el.getAttribute('height') || '0');
        if (w <= 0 || h <= 0) return;

        // Per spec an omitted rx/ry mirrors the other, and both clamp to half
        // the corresponding side.
        const rxAttr = el.getAttribute('rx');
        const ryAttr = el.getAttribute('ry');
        const rxRaw = rxAttr !== null ? parseFloat(rxAttr) : ryAttr !== null ? parseFloat(ryAttr) : 0;
        const ryRaw = ryAttr !== null ? parseFloat(ryAttr) : rxRaw;
        const rx = Math.min(Math.max(Number.isFinite(rxRaw) ? rxRaw : 0, 0), w / 2);
        const ry = Math.min(Math.max(Number.isFinite(ryRaw) ? ryRaw : 0, 0), h / 2);

        const style = getShapeStyle(el, styleMap, doc);
        if (style.isFillNone && style.isStrokeNone) return;

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
        if (rx <= 0 || ry <= 0) return;

        const style = getShapeStyle(el, styleMap, doc);
        if (style.isFillNone && style.isStrokeNone) return;

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

    let activeShapes = uniqueRawShapes;
    if (activeShapes.length > 1) {
      const contentShapes = activeShapes.filter(shape => {
        let sMinX = Infinity, sMinY = Infinity, sMaxX = -Infinity, sMaxY = -Infinity;
        if (shape.type === 'line' && shape.absPoints) {
          shape.absPoints.forEach(([x, y]) => {
            sMinX = Math.min(sMinX, x);
            sMinY = Math.min(sMinY, y);
            sMaxX = Math.max(sMaxX, x);
            sMaxY = Math.max(sMaxY, y);
          });
        } else if (shape.type === 'ellipse' && shape.cx !== undefined && shape.rx !== undefined) {
          sMinX = shape.cx - shape.rx;
          sMinY = shape.cy! - shape.ry!;
          sMaxX = shape.cx + shape.rx;
          sMaxY = shape.cy! + shape.ry!;
        }
        return !(sMinX <= 0.5 && sMinY <= 0.5 && sMaxX >= 23.5 && sMaxY >= 23.5);
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

export function createExcalidrawItem(
  icon: GCPIcon,
  options: ExcalidrawOptions,
  baseX = 0,
  baseY = 0,
  isLibraryExport = false
): { elements: ExcalidrawElement[]; files: Record<string, ExcalidrawFile> } {
  const elements: ExcalidrawElement[] = [];
  const files: Record<string, ExcalidrawFile> = {};
  const groupId = generateRandomId();

  const iconWidth = Math.round(48 * options.iconScale);
  const iconHeight = Math.round(48 * options.iconScale);
  const padding = options.showCard ? options.padding : 0;
  const labelText = icon.title;

  const labelFontSize = options.labelFontSize;
  const labelWidth = Math.max(Math.round(labelText.length * labelFontSize * 0.55), 40);
  const labelHeight = Math.round(labelFontSize * 1.3);

  let cardWidth = iconWidth;
  let cardHeight = iconHeight;
  let iconX = baseX;
  let iconY = baseY;
  let labelX = baseX;
  let labelY = baseY;

  if (options.labelPosition === 'bottom') {
    cardWidth = Math.max(iconWidth + padding * 2, labelWidth + padding * 2);
    cardHeight = iconHeight + padding * 2 + (options.showLabel ? labelHeight + 8 : 0);
    iconX = baseX + (cardWidth - iconWidth) / 2;
    iconY = baseY + padding;
    labelX = baseX + (cardWidth - labelWidth) / 2;
    labelY = baseY + padding + iconHeight + 8;
  } else if (options.labelPosition === 'right') {
    cardWidth = iconWidth + (options.showLabel ? labelWidth + 12 : 0) + padding * 2;
    cardHeight = Math.max(iconHeight, labelHeight) + padding * 2;
    iconX = baseX + padding;
    iconY = baseY + (cardHeight - iconHeight) / 2;
    labelX = baseX + padding + iconWidth + 12;
    labelY = baseY + (cardHeight - labelHeight) / 2;
  } else if (options.labelPosition === 'top') {
    cardWidth = Math.max(iconWidth + padding * 2, labelWidth + padding * 2);
    cardHeight = iconHeight + padding * 2 + (options.showLabel ? labelHeight + 8 : 0);
    labelX = baseX + (cardWidth - labelWidth) / 2;
    labelY = baseY + padding;
    iconX = baseX + (cardWidth - iconWidth) / 2;
    iconY = baseY + padding + (options.showLabel ? labelHeight + 8 : 0);
  } else {
    cardWidth = Math.max(iconWidth, labelWidth) + padding * 2;
    cardHeight = iconHeight + labelHeight + padding * 2 + 4;
    iconX = baseX + (cardWidth - iconWidth) / 2;
    iconY = baseY + padding;
    labelX = baseX + (cardWidth - labelWidth) / 2;
    labelY = baseY + padding + iconHeight + 4;
  }

  // 1. Frame Card
  if (options.showCard && options.cardStyle !== 'none') {
    elements.push(createBaseElement('rectangle', baseX, baseY, cardWidth, cardHeight, groupId, {
      index: 'a0',
      strokeColor: options.cardStrokeColor,
      backgroundColor: options.cardBgColor,
      fillStyle: options.cardStyle === 'sketch-box' ? 'hachure' : 'solid',
      strokeWidth: options.cardStyle === 'outline' ? 2 : 1,
      roughness: options.roughness,
      roundness: options.cardStyle === 'soft-card' || options.cardStyle === 'badge' ? { type: 3 } : null,
    }));
  }

  // 2. Vector Shapes vs Image
  const useVector = isLibraryExport || options.exportMode === 'vector';
  const vectorElements = useVector
    ? parseSvgToExcalidrawElements(icon.rawSvg, Math.round(iconX), Math.round(iconY), iconWidth, iconHeight, groupId, options.roughness)
    : [];

  if (vectorElements.length > 0) {
    elements.push(...vectorElements);
  } else {
    const fileId = generateRandomId();
    files[fileId] = { mimeType: 'image/svg+xml', id: fileId, dataURL: icon.dataUrl, created: Date.now() };

    elements.push(createBaseElement('image', Math.round(iconX), Math.round(iconY), iconWidth, iconHeight, groupId, {
      fileId,
      scale: [1, 1],
      status: 'saved',
    }));
  }

  // 3. Label Text Element
  if (options.showLabel) {
    elements.push(createBaseElement('text', Math.round(labelX), Math.round(labelY), labelWidth, labelHeight, groupId, {
      index: 'a2',
      strokeColor: options.labelColor,
      text: labelText,
      originalText: labelText,
      fontSize: options.labelFontSize,
      fontFamily: options.labelFontFamily,
      textAlign: 'center',
      verticalAlign: 'top',
      baseline: labelFontSize,
      containerId: null,
      lineHeight: 1.25,
    }));
  }

  return { elements, files };
}

export function buildExcalidrawLibraryPackage(icons: GCPIcon[], options: ExcalidrawOptions): ExcalidrawLibraryPackage {
  const allFiles: Record<string, ExcalidrawFile> = {};

  const libraryItems = icons.map((icon, idx) => {
    const col = idx % 10;
    const row = Math.floor(idx / 10);
    const { elements, files } = createExcalidrawItem(icon, options, col * 180, row * 180, true);

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
  icons: GCPIcon[],
  options: ExcalidrawOptions
): { jsonText: string; excalidrawClipboardJson: string } {
  let allElements: ExcalidrawElement[] = [];
  const allFiles: Record<string, ExcalidrawFile> = {};

  icons.forEach((icon, idx) => {
    const col = idx % 8;
    const row = Math.floor(idx / 8);
    const { elements, files } = createExcalidrawItem(icon, options, col * 160, row * 160, false);
    allElements = allElements.concat(elements);
    Object.assign(allFiles, files);
  });

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
