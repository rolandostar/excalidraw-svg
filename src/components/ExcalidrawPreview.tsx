import { memo, useEffect, useRef, useState } from 'react';
import type { ExcalidrawElement, ExcalidrawFile } from '../types/excalidraw';
import { exportSceneArgs, type FrameWindow, withFrame } from '../scene/frame';

/**
 * Renders elements with **Excalidraw's own exporter**, not a lookalike.
 *
 * The whole point of the preview is to show what will actually appear after a
 * paste, so approximating it with CSS or with a raw Rough.js call would
 * reintroduce exactly the class of lie this project exists to eliminate -
 * Excalidraw only fills a `line` when `isPathALoop(points)` holds, applies its
 * own `generateRoughOptions`, and derives the viewBox from element bounds.
 *
 * `@excalidraw/utils` is heavy, so it is imported dynamically and cached: the
 * landing page must not pay for it until something is actually converted.
 */
type Exporter = (typeof import('@excalidraw/utils'))['exportToSvg'];

let exporterPromise: Promise<Exporter> | null = null;

/**
 * Hoisted so the default is *identity-stable*.
 *
 * As a `files = {}` default parameter this allocated a fresh object on every
 * render, and it is an effect dependency. That silently defeated every
 * `useMemo` upstream: a single tick of the font-size slider re-ran
 * `exportToSvg` for all 216 grid cards even though nothing about their
 * geometry had changed.
 */
const NO_FILES: Record<string, ExcalidrawFile> = {};

function loadExporter(): Promise<Exporter> {
  exporterPromise ??= import('@excalidraw/utils').then(m => m.exportToSvg);
  return exporterPromise;
}

interface ExcalidrawPreviewProps {
  elements: ExcalidrawElement[];
  files?: Record<string, ExcalidrawFile>;
  /** Rendered as the accessible description of the output. */
  label: string;
  /**
   * Force the export to be framed on this window instead of the scene's own
   * ink box. Required whenever the result sits beside the source image, or the
   * two panes get cropped differently and a correct conversion looks wrong.
   */
  frame?: FrameWindow;
}

function ExcalidrawPreviewImpl({
  elements,
  files = NO_FILES,
  label,
  frame,
}: ExcalidrawPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    // Only announce "Rendering…" if there is nothing on screen yet. Flipping a
    // ready preview back to loading on every re-export made the grid strobe.
    setStatus(prev => (prev === 'ready' ? prev : 'loading'));

    const scene = frame ? withFrame(elements, frame) : elements;

    loadExporter()
      .then(exportToSvg => exportToSvg(exportSceneArgs(scene, files)))
      .then(svg => {
        if (cancelled || !hostRef.current) return;

        // Drop the intrinsic size so CSS drives the box, and let the viewBox
        // plus preserveAspectRatio letterbox the artwork inside it. Leaving
        // width/height as percentages made the element resolve to a square
        // larger than its container, which then got cropped.
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', label);

        // Inserting the returned node rather than its serialised markup keeps
        // this off the innerHTML path entirely.
        hostRef.current.replaceChildren(svg);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setMessage(err instanceof Error ? err.message : String(err));
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [elements, files, label, frame]);

  return (
    <div className="excalidraw-preview">
      <div ref={hostRef} className="excalidraw-preview-host" hidden={status !== 'ready'} />
      {status === 'loading' && <span className="preview-note">Rendering…</span>}
      {status === 'error' && (
        <span className="preview-note preview-note-error">Could not render: {message}</span>
      )}
    </div>
  );
}

/**
 * Memoised because the icon grid mounts 216 of these. Every prop it takes is
 * either a primitive or memoised by the caller, so a shallow compare is enough
 * to skip the exporter entirely when only a cosmetic option changed.
 */
export const ExcalidrawPreview = memo(ExcalidrawPreviewImpl);
