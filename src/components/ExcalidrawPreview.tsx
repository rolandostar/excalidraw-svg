import { useEffect, useRef, useState } from 'react';
import type { ExcalidrawElement, ExcalidrawFile } from '../types';
import { withFrame, type FrameWindow } from '../utils/sceneFrame';

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

export function ExcalidrawPreview({ elements, files = {}, label, frame }: ExcalidrawPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    const scene = frame ? withFrame(elements, frame) : elements;

    loadExporter()
      .then(exportToSvg =>
        exportToSvg({
          elements: scene as never,
          files: (Object.keys(files).length ? files : null) as never,
          appState: {
            exportBackground: false,
            exportWithDarkMode: false,
            exportScale: 1,
            viewBackgroundColor: '#ffffff',
          } as never,
          exportPadding: 0,
          skipInliningFonts: true,
        })
      )
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
