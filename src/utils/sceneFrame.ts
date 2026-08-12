/**
 * How this project calls `exportToSvg`, and how it forces a scene to be
 * exported inside a caller-chosen window.
 *
 * Both halves are shared between the harness, which asserts that nothing
 * escapes the window, and the browser preview, which uses it to align the two
 * panes. Neither can drift from the other without the comparison quietly
 * measuring two different things.
 */
import type { ExcalidrawElement, ExcalidrawFile } from '../types/excalidraw';

/**
 * The arguments every `exportToSvg` call in this project passes.
 *
 * `skipInliningFonts` is load-bearing beyond this call: the font-stripping
 * transform in `vite.config.ts` deletes 16.6 MB of payload from
 * `@excalidraw/utils` and is only sound because nothing ever asks for a font.
 * That claim is checkable here rather than being an invariant spread across
 * two files that never import each other.
 */
export function exportSceneArgs(
  elements: ExcalidrawElement[],
  files: Record<string, ExcalidrawFile>,
  exportPadding = 0
) {
  return {
    elements: elements as never,
    files: (Object.keys(files).length ? files : null) as never,
    appState: {
      exportBackground: false,
      exportWithDarkMode: false,
      exportScale: 1,
      viewBackgroundColor: '#ffffff',
    } as never,
    exportPadding,
    skipInliningFonts: true as const,
  };
}

export interface FrameWindow {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
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
 */

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
