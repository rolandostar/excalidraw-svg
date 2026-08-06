import { useCallback, useEffect, useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';

export interface SvgInput {
  /** File name without extension, or a synthesised name for pasted markup. */
  name: string;
  source: string;
  origin: 'file' | 'paste';
}

interface SvgDropzoneProps {
  onAccept: (input: SvgInput) => void;
  /** Rendered compact once a result is already on screen. */
  compact?: boolean;
}

const MAX_BYTES = 2 * 1024 * 1024;

function looksLikeSvg(text: string): boolean {
  return /<svg[\s>]/i.test(text);
}

export function SvgDropzone({ onAccept, compact = false }: SvgDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Nested dragenter/dragleave on children would otherwise flicker the state.
  const dragDepth = useRef(0);

  const accept = useCallback(
    (name: string, source: string, origin: SvgInput['origin']) => {
      if (!looksLikeSvg(source)) {
        setError('That does not look like an SVG — no <svg> element found.');
        return;
      }
      setError(null);
      onAccept({ name: name.replace(/\.svg$/i, '') || 'pasted-svg', source, origin });
    },
    [onAccept]
  );

  const readFile = useCallback(
    (file: File) => {
      if (file.size > MAX_BYTES) {
        setError(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 2 MB.`);
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => setError('Could not read that file.');
      reader.onload = () => accept(file.name, String(reader.result ?? ''), 'file');
      reader.readAsText(file);
    },
    [accept]
  );

  // Pasting markup straight from a design tool is the fastest path in, so it
  // is wired at the document level rather than on a focused input.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;

      const file = Array.from(event.clipboardData?.files ?? [])[0];
      if (file) {
        event.preventDefault();
        readFile(file);
        return;
      }

      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (looksLikeSvg(text)) {
        event.preventDefault();
        accept('pasted-svg', text, 'paste');
      }
    };

    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [accept, readFile]);

  return (
    <div className={`dropzone-wrap${compact ? ' is-compact' : ''}`}>
      <div
        className={`dropzone${isDragging ? ' is-dragging' : ''}`}
        onDragEnter={e => {
          e.preventDefault();
          dragDepth.current += 1;
          setIsDragging(true);
        }}
        onDragOver={e => e.preventDefault()}
        onDragLeave={e => {
          e.preventDefault();
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) {
            dragDepth.current = 0;
            setIsDragging(false);
          }
        }}
        onDrop={e => {
          e.preventDefault();
          dragDepth.current = 0;
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) readFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Drop an SVG file here, or activate to browse"
      >
        <UploadCloud className="dropzone-icon" size={compact ? 20 : 32} aria-hidden="true" />
        <p className="dropzone-title">
          {compact ? 'Convert another SVG' : 'Drop an SVG here'}
        </p>
        {!compact && (
          <p className="dropzone-hint">
            or paste markup &middot; <span className="text-link">browse files</span>
          </p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".svg,image/svg+xml"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) readFile(file);
            e.target.value = '';
          }}
        />
      </div>

      {error && (
        <p className="dropzone-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
