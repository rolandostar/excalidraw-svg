import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, ExternalLink } from 'lucide-react';
import { ExcalidrawPreview } from './ExcalidrawPreview';
import { ExternalA, Notice, WarningList } from './ui';
import { convertSvg, SvgConversionError } from '../utils/convertSvg';
import { DROP_REASON_LABELS, type ConversionDiagnostics } from '../utils/convert/parseSvg';
import { buildIssueUrl } from '../utils/issueReport';
import { downloadJson } from '../utils/download';
import { plural } from '../utils/plural';
import { useClipboardCopy } from '../hooks';
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
  const [verdict, setVerdict] = useState<Verdict>('unasked');

  // A fresh copy re-opens the question, even if it was already answered for
  // this same file.
  const onCopied = useCallback(() => setVerdict('unasked'), []);
  const { copied, copy } = useClipboardCopy({ resetMs: 2500, onSuccess: onCopied });

  // REQUIRED, not an optimisation. `outcome.result.elements` is what reaches
  // `ExcalidrawPreview`, which compares it by identity and re-runs the
  // exporter whenever it changes. Re-converting per render would also mean
  // re-parsing the SVG on every keystroke elsewhere on the page.
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
  // REQUIRED, not an optimisation: `frame` is one of that component's memo
  // props and one of its effect dependencies.
  const frame = useMemo(
    () =>
      outcome.ok
        ? { x: 0, y: 0, width: outcome.result.width, height: outcome.result.height }
        : undefined,
    [outcome]
  );

  // A new file is a new question; do not carry the previous answer over.
  useEffect(() => setVerdict('unasked'), [input.source]);

  if (!outcome.ok) {
    return (
      <section className="result" aria-live="polite">
        <Notice severity="error" title={`${input.name}.svg could not be converted`}>
          <p className="notice-text">{outcome.message}</p>
          {outcome.diagnostics && <DropBreakdown diagnostics={outcome.diagnostics} />}
        </Notice>
      </section>
    );
  }

  const result = outcome.result;
  const unsupported = result.warnings.filter(w => w.severity === 'unsupported');
  const approximated = result.warnings.filter(w => w.severity === 'approximated');

  const handleCopy = () => void copy(result.clipboardJson);
  const handleDownload = () => downloadJson(`${input.name}.excalidraw`, result.sceneJson);

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
            Excalidraw output &middot; {plural(result.counts.total, 'element')}
          </figcaption>
        </figure>
      </div>

      {unsupported.length > 0 && (
        <Notice severity="error" title="Parts of this file cannot be converted">
          <WarningList warnings={unsupported} />
        </Notice>
      )}

      {approximated.length > 0 && (
        <Notice severity="warn" title="Approximated">
          <WarningList warnings={approximated} />
        </Notice>
      )}

      {result.auditIssues.length > 0 && (
        <Notice
          severity="warn"
          title={`${plural(result.auditIssues.length, 'shape')} will not draw as intended`}
        >
          <ul className="notice-list">
            {result.auditIssues.slice(0, 5).map((issue, i) => (
              <li key={i}>
                <code>{issue.kind}</code> — {issue.detail}
              </li>
            ))}
          </ul>
        </Notice>
      )}

      {result.diagnostics.skippedTotal > 0 && (
        <Notice
          severity="warn"
          title={`${plural(
            result.diagnostics.skippedTotal,
            'shape'
          )} in the source produced no output`}
        >
          <DropBreakdown diagnostics={result.diagnostics} />
        </Notice>
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
          <p className="verdict-question">Good — that's what it's meant to do.</p>
        </div>
      )}

      {verdict === 'bad' && (
        <div className="verdict verdict-bad">
          <p className="verdict-question">Then it's a bug, and we want the file.</p>
          <p className="verdict-text">
            Accepted reports get added to the test suite, so the same failure cannot come
            back unnoticed. The issue is already filled in with what the converter detected
            — just attach the SVG and say what looks wrong.
          </p>
          <ExternalA className="btn btn-primary" href={buildIssueUrl(input.name, result)}>
            <ExternalLink size={16} />
            Open a prefilled issue
          </ExternalA>
        </div>
      )}
    </section>
  );
}
