/**
 * Forces a scene to be exported inside a caller-chosen window.
 *
 * `exportToSvg` always crops to the scene's bounding box and bakes the
 * resulting offset into every element transform, so the output cannot be
 * reframed afterwards. Prepending an invisible `line` that spans the desired
 * window makes that window *become* the bounding box, yielding a viewBox of
 * exactly `0 0 w h` with a zero translate.
 *
 * This matters for any side-by-side comparison. Framing each side on its own
 * ink box is a documented trap - it inflated measured error tenfold in the
 * harness, and in the UI it makes a correct conversion look misaligned purely
 * because the two panes were cropped differently.
 *
 * Shared between the harness, which asserts that nothing escapes the window,
 * and the browser preview, which uses it to align the two panes.
 */
import type { ExcalidrawElement } from '../types';

export interface FrameWindow {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function buildFrameSentinel(
  template: ExcalidrawElement,
  window: FrameWindow
): ExcalidrawElement {
  return {
    ...template,
    id: '__frame_sentinel__',
    type: 'line',
    x: window.x,
    y: window.y,
    width: window.width,
    height: window.height,
    angle: 0,
    strokeColor: 'transparent',
    backgroundColor: 'transparent',
    strokeWidth: 0.01,
    roughness: 0,
    opacity: 100,
    roundness: null,
    points: [
      [0, 0],
      [window.width, 0],
      [window.width, window.height],
      [0, window.height],
      [0, 0],
    ],
  } as unknown as ExcalidrawElement;
}

export function withFrame(
  elements: ExcalidrawElement[],
  window: FrameWindow
): ExcalidrawElement[] {
  if (elements.length === 0) return elements;
  return [buildFrameSentinel(elements[0], window), ...elements];
}
