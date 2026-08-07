import React from 'react';
import { X, Copy, Check, Code, Eye, AlertTriangle } from 'lucide-react';
import { IconAsset, ExcalidrawOptions } from '../types';
import { buildExcalidrawClipboardData, parseSvgToExcalidrawElements } from '../utils/excalidrawGenerator';
import { auditSceneFidelity } from '../utils/sceneAudit';
import { collectUnsupportedFeatures } from '../utils/svgSupport';
import { ICON_BASE_SIZE } from '../utils/defaultOptions';
import { ExcalidrawPreview } from './ExcalidrawPreview';
import { Link } from '../router';
import { formatPct } from '../site';
import iconBaseline from '../../tests/baselines/icons.json';

interface LivePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  icons: IconAsset[];
  options: ExcalidrawOptions;
}

const BASELINE = iconBaseline as Record<string, number>;

/**
 * Inspector for the generated scene.
 *
 * This panel used to print `Floating Precision: 2 Decimals` and
 * `Closed Polygons: Enforced` as hardcoded strings next to a dashed box
 * containing a shape count, under the heading "100% native vector shape
 * audit". None of it was measured and the "preview" showed no render at all.
 *
 * Everything here is now either computed from the scene about to be exported
 * or read from the committed fidelity baseline. If a number cannot be
 * produced, it says so rather than inventing one.
 */
export const LivePreviewModal: React.FC<LivePreviewModalProps> = ({
  isOpen,
  onClose,
  icons,
  options,
}) => {
  const [activeTab, setActiveTab] = React.useState<'audit' | 'json'>('audit');
  const [copied, setCopied] = React.useState(false);

  const targetIcons = React.useMemo(() => icons.slice(0, 4), [icons]);

  const audits = React.useMemo(
    () =>
      targetIcons.map(icon => {
        const size = Math.round(ICON_BASE_SIZE * options.iconScale);
        const elements = parseSvgToExcalidrawElements(
          icon.rawSvg,
          0,
          0,
          size,
          size,
          'group_audit',
          options.roughness
        );

        return {
          icon,
          size,
          elements,
          lines: elements.filter(e => e.type === 'line').length,
          ellipses: elements.filter(e => e.type === 'ellipse').length,
          issues: auditSceneFidelity(elements),
          warnings: collectUnsupportedFeatures(icon.rawSvg),
          // Baseline keys are `<set>__<filename>`, matching the ids the
          // fidelity harness assigns when it walks `svg/<set>/`.
          baseline: BASELINE[`${icon.setId}__${icon.name}`] as number | undefined,
        };
      }),
    [targetIcons, options.iconScale, options.roughness]
  );

  const { jsonText } = React.useMemo(
    () => buildExcalidrawClipboardData(targetIcons, options),
    [targetIcons, options]
  );

  if (!isOpen) return null;

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Code size={18} className="text-blue-400" />
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Scene inspector
              {icons.length > targetIcons.length && (
                <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                  {' '}
                  — first {targetIcons.length} of {icons.length}
                </span>
              )}
            </h3>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-tabs">
          <button
            className={`btn btn-sm ${activeTab === 'audit' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('audit')}
          >
            <Eye size={15} />
            Measured output
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'json' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('json')}
          >
            <Code size={15} />
            Clipboard JSON
          </button>
        </div>

        <div className="modal-body">
          {activeTab === 'audit' ? (
            <>
              <p className="doc-body" style={{ fontSize: '0.83rem' }}>
                Rendered with Excalidraw's own exporter — this is the scene that lands on your
                canvas, not a mock. Shape error is the committed figure from the fidelity
                harness for this icon.{' '}
                <Link to="/methodology" className="text-link" onClick={onClose}>
                  How that is measured
                </Link>
              </p>

              <div className="inspector-grid">
                {audits.map(a => (
                  <div className="inspector-card" key={a.icon.id}>
                    <div className="inspector-head">
                      <span className="case-name">{a.icon.title}</span>
                      {a.baseline === undefined ? (
                        <span className="case-score" title="Not present in the committed baseline">
                          not scored
                        </span>
                      ) : (
                        <span className="case-score">{formatPct(a.baseline, 3)}</span>
                      )}
                    </div>

                    <div className="inspector-panes">
                      <div className="inspector-pane">
                        <img src={a.icon.dataUrl} alt="" />
                        <span>Source</span>
                      </div>
                      <div className="inspector-pane">
                        <ExcalidrawPreview
                          elements={a.elements}
                          label={`${a.icon.title} converted`}
                          frame={{ x: 0, y: 0, width: a.size, height: a.size }}
                        />
                        <span>Excalidraw</span>
                      </div>
                    </div>

                    <dl className="inspector-stats">
                      <div>
                        <dt>Elements</dt>
                        <dd>{a.elements.length}</dd>
                      </div>
                      <div>
                        <dt>Polylines</dt>
                        <dd>{a.lines}</dd>
                      </div>
                      <div>
                        <dt>Ellipses</dt>
                        <dd>{a.ellipses}</dd>
                      </div>
                      <div>
                        <dt>Export size</dt>
                        <dd>{a.size}px</dd>
                      </div>
                    </dl>

                    {a.issues.length > 0 && (
                      <p className="inspector-issue">
                        <AlertTriangle size={13} /> {a.issues.length} shape
                        {a.issues.length === 1 ? '' : 's'} will not draw as intended
                      </p>
                    )}
                    {a.warnings.length > 0 && (
                      <p className="inspector-issue">
                        <AlertTriangle size={13} />{' '}
                        {a.warnings.map(w => `${w.feature} x${w.count}`).join(', ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="doc-body" style={{ fontSize: '0.83rem' }}>
                The exact <code>excalidraw/clipboard</code> payload for the current selection
                and settings.
              </p>
              <pre className="code-block" style={{ maxHeight: '360px' }}>
                {jsonText}
              </pre>
            </>
          )}

          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
            <button className="btn btn-primary" onClick={handleCopyJson}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Copied' : 'Copy JSON'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
