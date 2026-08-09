/**
 * The last step: raw user-space geometry becomes Excalidraw elements.
 *
 * Separate from the converters because this is the only place that knows about
 * Excalidraw's schema, its defaults, and the viewBox -> target fit. Everything
 * upstream works in the source file's own coordinates.
 */
import type { ExcalidrawElement } from '../../types';
import { closeRing, boundsOf } from '../svg/geometry';
import { OUTPUT_SIMPLIFY_TOLERANCE_PX, simplifyClosedRing } from './simplify';
import type { RawShape } from './rawShape';

export function generateRandomId(): string {
  return Math.random().toString(16).substring(2, 18);
}

export function generateRandomSeed(): number {
  return Math.floor(Math.random() * 2000000000);
}

/** Where and how big an element is, in scene units. */
export interface ElementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Creates a base Excalidraw element with all required default properties */
export function createBaseElement(
  type: string,
  rect: ElementRect,
  groupId: string,
  overrides: Partial<ExcalidrawElement> = {}
): ExcalidrawElement {
  return {
    id: generateRandomId(),
    type,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
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

/** The viewBox -> target mapping, plus the two per-scene style choices. */
export interface EmitTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  groupId: string;
  roughness: number;
}

/**
 * `strokeWidth` written onto every converted element.
 *
 * Nothing renders it. Every element this converter emits keeps the
 * `strokeColor: 'transparent'` default, because a source stroke is emitted as
 * the filled *area* it covers instead (see `RawShapeSink.pushStroke`), and
 * `fillStyle` is always `solid` so Rough.js never derives a hatch spacing from
 * it either. Excalidraw still requires the field.
 *
 * The value is what the old `toOutputStrokeWidth` helper computed once its
 * input is traced back to the literal `0` that all six raw-shape push sites
 * wrote: `((0 * fit) || fit)` is just `fit`, rounded to three places and
 * floored. Reproduced exactly - it is *not* a constant across files, it
 * tracks the fit - so the emitted JSON does not change.
 */
function unrenderedStrokeWidth(fit: number): number {
  return Math.max(Number(fit.toFixed(3)), 0.25);
}

export function rawShapesToElements(
  shapes: RawShape[],
  { scale, offsetX, offsetY, groupId, roughness }: EmitTransform
): ExcalidrawElement[] {
  const elements: ExcalidrawElement[] = [];
  const strokeWidth = unrenderedStrokeWidth(scale);

  for (const shape of shapes) {
    if (shape.type === 'ellipse') {
      const elX = Number((offsetX + (shape.cx - shape.rx) * scale).toFixed(2));
      const elY = Number((offsetY + (shape.cy - shape.ry) * scale).toFixed(2));
      const elW = Number((shape.rx * 2 * scale).toFixed(2));
      const elH = Number((shape.ry * 2 * scale).toFixed(2));

      elements.push(
        createBaseElement(
          'ellipse',
          { x: elX, y: elY, width: Math.max(elW, 2), height: Math.max(elH, 2) },
          groupId,
          {
            backgroundColor: shape.fill,
            strokeWidth,
            roughness,
            opacity: shape.opacity,
          }
        )
      );
      continue;
    }

    if (shape.absPoints.length < 2) continue;

    // Excalidraw only fills closed loops, so any ring carrying a fill has to
    // explicitly return to its starting point. These points are in output
    // space, where a micro-unit gap really is closed - hence 1e-6 rather than
    // the 1e-9 the boolean engine uses upstream.
    const wantsFill = !!shape.fill && shape.fill !== 'transparent';
    const closed = wantsFill ? closeRing(shape.absPoints, 1e-6) : shape.absPoints;

    // Simplified before the bounds are taken, so the element box stays tight
    // around the points that actually survive. Tolerance converts from output
    // units into the source's own units, the same way the flattening tolerance
    // does, so the error stays constant in pixels at any `iconScale`.
    const absPoints = wantsFill
      ? simplifyClosedRing(closed, OUTPUT_SIMPLIFY_TOLERANCE_PX / scale)
      : closed;

    const { minX, minY, maxX, maxY } = boundsOf(absPoints);

    const elX = Number((offsetX + minX * scale).toFixed(2));
    const elY = Number((offsetY + minY * scale).toFixed(2));
    const elW = Number(((maxX - minX) * scale).toFixed(2));
    const elH = Number(((maxY - minY) * scale).toFixed(2));

    const relPoints: [number, number][] = absPoints.map(([x, y]) => [
      Number(((x - minX) * scale).toFixed(2)),
      Number(((y - minY) * scale).toFixed(2)),
    ]);

    elements.push(
      createBaseElement(
        'line',
        { x: elX, y: elY, width: Math.max(elW, 1), height: Math.max(elH, 1) },
        groupId,
        {
          backgroundColor: shape.fill,
          strokeWidth,
          roughness,
          opacity: shape.opacity,
          points: relPoints,
          /*
           * Does not affect rendering. Excalidraw decides whether to fill a
           * `line` from `isPathALoop(points)` alone, which a closed ring
           * already satisfies.
           *
           * It is set so the editor treats our output as what it is - a closed
           * polygon. Without it the line editor offers "Convert to polygon",
           * and the bucket-fill tool does not recognise our fills as paint it
           * can restyle in place, so clicking one stacks a second fill on top.
           *
           * Guarded on `> 3` rather than `>= 3` to match Excalidraw's
           * `isValidPolygon`, which is stricter than `isPathALoop`. `restore`
           * silently forces the field back to false when it disagrees, so a
           * claim we cannot back is worse than not making it.
           */
          ...(wantsFill && relPoints.length > 3 ? { polygon: true } : {}),
        }
      )
    );
  }

  return elements;
}
