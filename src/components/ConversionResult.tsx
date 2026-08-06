import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, Download, ExternalLink, Info } from 'lucide-react';
import { ExcalidrawPreview } from './ExcalidrawPreview';
import { convertSvg, SvgConversionError } from '../utils/convertSvg';
import { DROP_REASON_LABELS, type ConversionDiagnostics } from '../utils/excalidrawGenerator';
import { buildIssueUrl } from '../utils/issueReport';
import type { SvgInput } from './SvgDropzone';

/**
 * Why source shapes produced no output.
 *
 * Shown on failure *and* on success, because a partial loss is the case the
 * user is least likely to notice unaided: the preview looks plausible and the
 * missing piece only turns up later, in Excalidraw.
 */
function DropBreakdown({ diagnostics }: { diagnostics: ConversionDiagnostics }) {
  if (diagnostics.skippedTotal === 0) return null;

  return (
    <ul className="notice-list">
      {diagnostics.drops.map((drop, i) => (
        <li key={i}>
          {drop.count} <code>&lt;{drop.tag}&gt;</code> {drop.count === 1 ? 'element' : 'elements'} —{' '}
          {drop.detail === DROP_REASON_LABELS[drop.reason]
            ? drop.detail
            : `${DROP_REASON_LABELS[drop.reason]}: ${drop.detail}`}
        </li>
      ))}
    </ul>
  );
}

interface ConversionResultProps {
  input: SvgInput;
}

type Verdict = 'unasked' | 'good' | 'bad';

export function ConversionResultPanel({ input }: ConversionResultProps) {
  const [copied, setCopied] = useState(false);
  const [verdict, setVerdict] = useState<Verdict>('unasked');

  const outcome = useMemo(() => {
    try {
      return { ok: true as const, result: convertSvg(input.source) };
    } catch (err) {
      return {
        ok: false as const,
        message:
          err instanceof SvgConversionError
            ? err.message
            : `Conversion failed: ${err instanceof Error ? err.message : String(err)}`,
        diagnostics: err instanceof SvgConversionError ? err.diagnostics : undefined,
      };
    }
  }, [input.source]);

  // Identity-stable so ExcalidrawPreview does not re-export on every render.
  const frame = useMemo(
    () =>
      outcome.ok
        ? { x: 0, y: 0, width: outcome.result.width, height: outcome.result.height }
        : undefined,
    [outcome]
  );

  // A new file is a new question; do not carry the previous answer over.
  useEffect(() => {
    setVerdict('unasked');
    setCopied(false);
  }, [input.source]);

  if (!outcome.ok) {
    return (
      <section className="result" aria-live="polite">
        <div className="notice notice-error">
          <AlertTriangle size={16} aria-hidden="true" />
          <div>
            <p className="notice-title">{input.name}.svg could not be converted</p>
            <p className="notice-text">{outcome.message}</p>
            {outcome.diagnostics && <DropBreakdown diagnostics={outcome.diagnostics} />}
          </div>
        </div>
      </section>
    );
  }

  const result = outcome.result;
  const unsupported = result.warnings.filter(w => w.severity === 'unsupported');
  const approximated = result.warnings.filter(w => w.severity === 'approximated');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.clipboardJson);
      setCopied(true);
      setVerdict('unasked');
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([result.sceneJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${input.name}.excalidraw`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="result" aria-live="polite">
      {/*
        Both panes are framed on the same box: the source by its own viewBox,
        the output by a sentinel spanning the identical artboard. Letting each
        side crop to its own ink would make a pixel-perfect conversion look
        misaligned purely because the two images were cropped differently.
      */}
      <div className="result-compare">
        <figure className="compare-pane">
          <div className="compare-canvas">
            {/* An isolated <img> means nothing in an untrusted file can script
                the page or reach the surrounding DOM. */}
            <img
              src={`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(input.source)))}`}
              alt={`${input.name} source`}
            />
          </div>
          <figcaption>
            Source SVG &middot; {result.dimensions.width}&times;{result.dimensions.height}
          </figcaption>
        </figure>

        <figure className="compare-pane">
          <div className="compare-canvas">
            <ExcalidrawPreview
              elements={result.elements}
              label={`${input.name} converted`}
              frame={frame}
            />
          </div>
          <figcaption>
            Excalidraw output &middot; {result.counts.total} element
            {result.counts.total === 1 ? '' : 's'}
          </figcaption>
        </figure>
      </div>

      {unsupported.length > 0 && (
        <div className="notice notice-error">
          <AlertTriangle size={16} aria-hidden="true" />
          <div>
            <p className="notice-title">Parts of this file cannot be converted</p>
            <ul className="notice-list">
              {unsupported.map(w => (
                <li key={w.feature}>
                  <code>{w.feature}</code> &times;{w.count} — {w.detail}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {approximated.length > 0 && (
        <div className="notice notice-warn">
          <Info size={16} aria-hidden="true" />
          <div>
            <p className="notice-title">Approximated</p>
            <ul className="notice-list">
              {approximated.map(w => (
                <li key={w.feature}>
                  <code>{w.feature}</code> &times;{w.count} — {w.detail}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {result.auditIssues.length > 0 && (
        <div className="notice notice-warn">
          <AlertTriangle size={16} aria-hidden="true" />
          <div>
            <p className="notice-title">
              {result.auditIssues.length} shape{result.auditIssues.length === 1 ? '' : 's'} will
              not draw as intended
            </p>
            <ul className="notice-list">
              {result.auditIssues.slice(0, 5).map((issue, i) => (
                <li key={i}>
                  <code>{issue.kind}</code> — {issue.detail}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {result.diagnostics.skippedTotal > 0 && (
        <div className="notice notice-warn">
          <Info size={16} aria-hidden="true" />
          <div>
            <p className="notice-title">
              {result.diagnostics.skippedTotal} shape
              {result.diagnostics.skippedTotal === 1 ? '' : 's'} in the source produced no output
            </p>
            <DropBreakdown diagnostics={result.diagnostics} />
          </div>
        </div>
      )}

      <div className="result-actions">
        <button className="btn btn-primary" onClick={handleCopy}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Copied — paste into Excalidraw' : 'Copy to clipboard'}
        </button>
        <button className="btn btn-secondary" onClick={handleDownload}>
          <Download size={16} />
          Download .excalidraw
        </button>
      </div>

      {copied && verdict === 'unasked' && (
        <div className="verdict">
          <p className="verdict-question">Pasted it — does it look right?</p>
          <div className="verdict-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => setVerdict('good')}>
              Looks good
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setVerdict('bad')}>
              Something's off
            </button>
          </div>
        </div>
      )}

      {verdict === 'good' && (
        <div className="verdict">
          <p className="verdict-question">Good. That is the expected outcome, not a lucky one.</p>
        </div>
      )}

      {verdict === 'bad' && (
        <div className="verdict verdict-bad">
          <p className="verdict-question">Then it's a bug, and we want the file.</p>
          <p className="verdict-text">
            Accepted reports become permanent fixtures in the torture suite, so the same
            failure cannot come back unnoticed. The issue is prefilled with what the
            converter already detected — just attach the SVG and say what looks wrong.
          </p>
          <a
            className="btn btn-primary"
            href={buildIssueUrl(input.name, result)}
            target="_blank"
            rel="noreferrer noopener"
          >
            <ExternalLink size={16} />
            Open a prefilled issue
          </a>
        </div>
      )}
    </section>
  );
}
