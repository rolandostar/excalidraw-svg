/**
 * The full-artboard background plate filter.
 *
 * Its own module because it is the only step in the pipeline that deletes
 * artwork on a heuristic, and the two constants it turns on are the whole
 * decision. Both are load-bearing and both have been wrong before; keeping
 * them next to the test they parameterise is what makes that reviewable.
 */
import { signedArea } from '../regions/primitives';
import { boundsOf } from '../svg/geometry';
import type { ViewBox } from '../svg/viewBox';
import type { RawShape } from './rawShape';

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

/**
 * Drops a full-artboard background plate, which design tools emit on almost
 * every export and which would otherwise paste as an opaque slab over whatever
 * the user already had on the canvas.
 *
 * Two conditions, and both are necessary.
 *
 * The bounds test is a fraction of the *actual* viewBox, not a constant: a
 * margin hard-coded for a 24x24 artboard sits at 73% of the width of a 32x32
 * one, and every shape reaching that far reads as a background.
 *
 * The solidity test is what stops the filter from eating artwork. Spanning the
 * artboard does not make something a background: a silhouette logo spans it
 * too. A background *plate* is solid - it fills essentially all of its own
 * bounding box - whereas real artwork does not. The reported squirrel line-art
 * measured 0.245 here, a rectangle measures 1.0, and a full-artboard ellipse
 * measures pi/4 = 0.785.
 *
 * Never returns an empty list: a file that is *only* a plate keeps its plate.
 */
export function dropBackgroundPlate(shapes: RawShape[], viewBox: ViewBox): RawShape[] {
  if (shapes.length <= 1) return shapes;

  const marginX = viewBox.width * ARTBOARD_MARGIN_FRACTION;
  const marginY = viewBox.height * ARTBOARD_MARGIN_FRACTION;

  const measure = (shape: RawShape) => {
    if (shape.type !== 'line') {
      const { cx, cy, rx, ry } = shape;
      return {
        minX: cx - rx,
        minY: cy - ry,
        maxX: cx + rx,
        maxY: cy + ry,
        solidity: Math.PI / 4,
      };
    }
    const box = boundsOf(shape.absPoints);
    const boxArea = (box.maxX - box.minX) * (box.maxY - box.minY);
    return {
      ...box,
      solidity: boxArea > 0 ? Math.abs(signedArea(shape.absPoints)) / boxArea : 0,
    };
  };

  const content = shapes.filter(shape => {
    const { minX: sMinX, minY: sMinY, maxX: sMaxX, maxY: sMaxY, solidity } = measure(shape);

    const spansArtboard =
      sMinX <= viewBox.x + marginX &&
      sMinY <= viewBox.y + marginY &&
      sMaxX >= viewBox.x + viewBox.width - marginX &&
      sMaxY >= viewBox.y + viewBox.height - marginY;

    return !(spansArtboard && solidity >= BACKGROUND_PLATE_SOLIDITY);
  });

  return content.length > 0 ? content : shapes;
}
