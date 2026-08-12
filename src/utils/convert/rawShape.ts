/**
 * The intermediate the converter produces before anything is scaled or
 * positioned: absolute-user-space geometry plus a fill.
 *
 * Modelled as a discriminated union rather than one optional-everything
 * interface. The old shape carried `absPoints?`, `cx?`, `cy?`, `rx?`, `ry?`
 * together, so every consumer re-proved which half was populated with a
 * four-clause `!== undefined` guard, and a wrong guess was a runtime `NaN`
 * rather than a type error.
 *
 * There is deliberately no stroke here. Every stroke a source declares is
 * emitted as the *area* it covers (see `shapeConverters.ts`), so a raw shape
 * is always fill-only; the `stroke`/`strokeWidth` fields this used to carry
 * were written as `'transparent'`/`0` at all six push sites and read nowhere.
 */

interface RawLine {
  type: 'line';
  /** Closed ring in root user space. */
  absPoints: [number, number][];
  fill: string;
  opacity: number;
}

interface RawEllipse {
  type: 'ellipse';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  fill: string;
  opacity: number;
}

export type RawShape = RawLine | RawEllipse;

/**
 * Drops unpainted shapes and exact duplicates.
 *
 * Design tools stack identical geometry routinely - a shape and its own
 * `<use>`, or the same path in two layers - and every duplicate is a full
 * Excalidraw element that renders on top of an identical one.
 */
export function dedupeRawShapes(shapes: RawShape[]): RawShape[] {
  const seen = new Set<string>();
  const unique: RawShape[] = [];

  for (const shape of shapes) {
    if (shape.fill === 'transparent') continue;
    const geometry =
      shape.type === 'line'
        ? JSON.stringify(shape.absPoints)
        : JSON.stringify([shape.cx, shape.cy, shape.rx, shape.ry]);
    const key = `${shape.type}_${shape.fill}_${geometry}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(shape);
  }

  return unique;
}
