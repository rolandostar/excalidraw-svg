/**
 * 2D affine transforms: parsing SVG `transform` attributes, composing them up
 * the element tree, and applying them to points.
 *
 * Its own module because every other part of the converter needs it and none
 * of them needs anything else from each other - clip paths, masks, bounding
 * boxes, stroke outlining and the artwork pipeline all resolve coordinates
 * through exactly these six functions.
 */
import type { BoundingBox } from './objectBounds';

/** 2D Affine Matrix transformation representation: [a, b, c, d, e, f] */
export type Matrix2D = [number, number, number, number, number, number];

export function multiplyMatrix(m1: Matrix2D, m2: Matrix2D): Matrix2D {
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

export function applyMatrix(m: Matrix2D, p: [number, number]): [number, number] {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}

/**
 * Uniform scale factor a transform applies to stroke width.
 *
 * SVG defines this as sqrt(|det|) for a non-uniform matrix, which is the
 * geometric mean of the two axis scales - the same value a browser uses.
 */
export function matrixScale(m: Matrix2D): number {
  const determinant = Math.abs(m[0] * m[3] - m[1] * m[2]);
  return determinant > 0 ? Math.sqrt(determinant) : 1;
}

export function parseTransformMatrix(transformStr: string | null): Matrix2D {
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
export function getCombinedTransformMatrixUntil(el: Element, stopAt?: Element): Matrix2D {
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

/** Maps the unit square onto a bounding box - the `objectBoundingBox` transform. */
export function boundingBoxMatrix(box: BoundingBox): Matrix2D {
  return [box.width, 0, 0, box.height, box.x, box.y];
}
