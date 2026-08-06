import './setupDom';

import { exportToSvg } from '@excalidraw/utils';
import { ExcalidrawElement, ExcalidrawFile } from '../src/types';
import { LINE_CONFIRM_THRESHOLD } from '../src/utils/defaultOptions';

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
export async function renderExcalidrawScene(
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
  const sentinel = {
    ...elements[0],
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

  const scene = await renderExcalidrawScene([sentinel, ...elements], files, 0);

  const [, , w, h] = scene.viewBox.split(/\s+/).map(Number);
  const escaped = Math.abs(w - window.width) > 0.05 || Math.abs(h - window.height) > 0.05;
  if (escaped) {
    throw new Error(
      `scene escaped its comparison window: expected ${window.width}x${window.height}, got ${w}x${h}`
    );
  }

  return scene;
}

export interface FidelityIssue {
  elementIndex: number;
  elementType: string;
  kind: 'unfilled-open-path' | 'degenerate' | 'missing-file';
  detail: string;
}

/**
 * Static analysis of a scene against the rules Excalidraw applies at render
 * time. Catches "looks right in the source SVG, disappears in Excalidraw"
 * regressions without needing a human to eyeball 216 images.
 */
export function auditSceneFidelity(
  elements: ExcalidrawElement[],
  files: Record<string, ExcalidrawFile> = {}
): FidelityIssue[] {
  const issues: FidelityIssue[] = [];

  elements.forEach((el, elementIndex) => {
    if (el.isDeleted) return;

    if (el.type === 'line') {
      const points = el.points || [];
      const hasFill = !!el.backgroundColor && el.backgroundColor !== 'transparent';

      if (points.length < 2) {
        issues.push({
          elementIndex,
          elementType: el.type,
          kind: 'degenerate',
          detail: `line has ${points.length} point(s); Excalidraw renders nothing`,
        });
        return;
      }

      if (hasFill) {
        const first = points[0];
        const last = points[points.length - 1];
        const gap = Math.hypot(first[0] - last[0], first[1] - last[1]);
        if (points.length < 3 || gap > LINE_CONFIRM_THRESHOLD) {
          issues.push({
            elementIndex,
            elementType: el.type,
            kind: 'unfilled-open-path',
            detail:
              `backgroundColor ${el.backgroundColor} will be ignored: path is not a loop ` +
              `(first/last gap ${gap.toFixed(2)} > LINE_CONFIRM_THRESHOLD ${LINE_CONFIRM_THRESHOLD})`,
          });
        }
      }
    }

    if ((el.type === 'ellipse' || el.type === 'rectangle') && (el.width <= 0 || el.height <= 0)) {
      issues.push({
        elementIndex,
        elementType: el.type,
        kind: 'degenerate',
        detail: `zero-sized ${el.type} (${el.width}x${el.height})`,
      });
    }

    if (el.type === 'image' && (!el.fileId || !files[el.fileId])) {
      issues.push({
        elementIndex,
        elementType: el.type,
        kind: 'missing-file',
        detail: `image element references fileId "${el.fileId}" which is not in files{}`,
      });
    }
  });

  return issues;
}
