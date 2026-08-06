import React from 'react';
import { X, Copy, Check, Code, Eye } from 'lucide-react';
import { GCPIcon, ExcalidrawOptions } from '../types';
import { buildExcalidrawClipboardData, parseSvgToExcalidrawElements } from '../utils/excalidrawGenerator';

interface LivePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  icons: GCPIcon[];
  options: ExcalidrawOptions;
}

export const LivePreviewModal: React.FC<LivePreviewModalProps> = ({
  isOpen,
  onClose,
  icons,
  options,
}) => {
  const [activeTab, setActiveTab] = React.useState<'audit' | 'json'>('audit');
  const [copied, setCopied] = React.useState(false);

  if (!isOpen) return null;

  const targetIcons = icons.length > 0 ? icons.slice(0, 4) : [];
  const { jsonText } = buildExcalidrawClipboardData(targetIcons, options);

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '820px' }}>
        <div className="modal-header">
          <div className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Code className="w-5 h-5 text-blue-400" />
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Excalidraw Vector Engine Inspector ({icons.length} icon{icons.length !== 1 ? 's' : ''})
            </h3>
          </div>
          <button
            className="icon-btn"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none' }}
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Tab Controls */}
        <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1.5rem 0', borderBottom: '1px solid var(--border-color)' }}>
          <button
            className={`btn btn-sm ${activeTab === 'audit' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('audit')}
          >
            <Eye className="w-4 h-4" />
            Vector Tracing Audit
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'json' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('json')}
          >
            <Code className="w-4 h-4" />
            Excalidraw JSON Schema
          </button>
        </div>

        <div className="modal-body">
          {activeTab === 'audit' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Below is the high-precision 100% native vector shape audit for the currently selected icons, comparing SVG source elements against generated Excalidraw native primitives.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {targetIcons.map(icon => {
                  const elements = parseSvgToExcalidrawElements(icon.rawSvg, 0, 0, 48, 48, 'group_audit', options.roughness);
                  const linesCount = elements.filter(e => e.type === 'line').length;
                  const ellipseCount = elements.filter(e => e.type === 'ellipse').length;

                  return (
                    <div
                      key={icon.id}
                      className="glass-panel"
                      style={{
                        padding: '1rem',
                        borderRadius: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                        background: 'var(--bg-primary)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                          {icon.title}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                          {icon.category}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', justifyContent: 'center', padding: '0.5rem 0' }}>
                        <div style={{ textAlign: 'center' }}>
                          <img src={icon.dataUrl} alt={icon.title} style={{ width: '48px', height: '48px' }} />
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>SVG Source</div>
                        </div>

                        <div style={{ fontSize: '1.2rem', color: 'var(--gcp-blue)' }}>➔</div>

                        <div style={{ textAlign: 'center' }}>
                          <div style={{ width: '48px', height: '48px', border: '1px dashed var(--gcp-blue)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(66, 133, 244, 0.05)' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--gcp-blue)' }}>
                              {elements.length} Shapes
                            </span>
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Excalidraw Vectors</div>
                        </div>
                      </div>

                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', background: 'var(--bg-secondary)', padding: '0.5rem', borderRadius: '6px' }}>
                        <div>Polylines/Lines: <strong style={{ color: 'var(--text-primary)' }}>{linesCount}</strong></div>
                        <div>Ellipses/Circles: <strong style={{ color: 'var(--text-primary)' }}>{ellipseCount}</strong></div>
                        <div>Floating Precision: <strong style={{ color: '#34a853' }}>2 Decimals</strong></div>
                        <div>Closed Polygons: <strong style={{ color: '#34a853' }}>Enforced</strong></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Below is the raw JSON schema payload generated for Excalidraw clipboard and library export.
              </p>

              <pre className="code-block" style={{ maxHeight: '350px' }}>
                {jsonText}
              </pre>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <button className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
            <button className="btn btn-primary" onClick={handleCopyJson}>
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied Payload!' : 'Copy Raw JSON'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
