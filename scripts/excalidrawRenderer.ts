import './setupDom';

import { exportToSvg } from '@excalidraw/utils';
import { ExcalidrawElement, ExcalidrawFile } from '../src/types';
import { withFrame } from '../src/utils/sceneFrame';

// The scene audit is pure and shared with the browser, so it lives in `src/`.
// Re-exported here so existing harness imports keep working.
export { auditSceneFidelity, type FidelityIssue } from '../src/utils/sceneAudit';

export interface RenderedScene {
  svg: string;
  width: number;
  height: number;
  viewBox: string;
}

/**
 * Renders Excalidraw elements with **Excalidraw's own renderer**.
 *
 * This is deliberately NOT a re-implementation on top of Rough.js. The previous
 * hand-rolled version diverged from Excalidraw in ways that made the visual
 * comparison lie, most notably:
 *
 *  - it filled every `line` element that had a `backgroundColor`, whereas
 *    Excalidraw only fills a line when `isPathALoop(points)` holds;
 *  - it passed its own Rough.js options (`fillWeight: -1`, `bowing: 0`, no
 *    `seed`, no `preserveVertices`, no roughness adjustment for small shapes)
 *    instead of Excalidraw's `generateRoughOptions()`;
 *  - it silently dropped `text` and `image` elements;
 *  - it hard-coded a 48x48 viewBox instead of deriving it from element bounds.
 *
 * Calling `exportToSvg` means the comparison image is byte-for-byte the scene
 * Excalidraw itself would draw for the pasted clipboard payload.
 */
async function renderExcalidrawScene(
  elements: ExcalidrawElement[],
  files: Record<string, ExcalidrawFile> = {},
  exportPadding = 0
): Promise<RenderedScene> {
  const svgElement = await exportToSvg({
    elements: elements as any,
    files: (Object.keys(files).length ? files : null) as any,
    appState: {
      exportBackground: false,
      exportWithDarkMode: false,
      exportScale: 1,
      viewBackgroundColor: '#ffffff',
    } as any,
    exportPadding,
    skipInliningFonts: true,
  });

  const viewBox = svgElement.getAttribute('viewBox') || '0 0 0 0';
  const [, , vbW, vbH] = viewBox.split(/\s+/).map(Number);

  return {
    svg: svgElement.outerHTML,
    width: Number.isFinite(vbW) ? vbW : 0,
    height: Number.isFinite(vbH) ? vbH : 0,
    viewBox,
  };
}

/**
 * Renders a scene inside a caller-chosen window instead of Excalidraw's
 * automatic content bounds.
 *
 * `exportToSvg` always crops to the scene's bounding box and bakes the
 * resulting offset into every element transform, so the output cannot be
 * reframed afterwards. Prepending an invisible `line` element that spans the
 * desired window makes that window *become* the bounding box, which yields a
 * `viewBox` of exactly `0 0 w h` with a zero translate - and therefore a frame
 * that can be aligned pixel-for-pixel with the source SVG.
 *
 * Throws if content escapes the window, because a silently shifted frame would
 * make every subsequent measurement wrong.
 */
export async function renderExcalidrawSceneInWindow(
  elements: ExcalidrawElement[],
  window: { x: number; y: number; width: number; height: number },
  files: Record<string, ExcalidrawFile> = {}
): Promise<RenderedScene> {
  const scene = await renderExcalidrawScene(withFrame(elements, window), files, 0);

  const [, , w, h] = scene.viewBox.split(/\s+/).map(Number);
  const escaped = Math.abs(w - window.width) > 0.05 || Math.abs(h - window.height) > 0.05;
  if (escaped) {
    throw new Error(
      `scene escaped its comparison window: expected ${window.width}x${window.height}, got ${w}x${h}`
    );
  }

  return scene;
}
