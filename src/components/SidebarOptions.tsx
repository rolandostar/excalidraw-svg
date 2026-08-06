import React from 'react';
import { Settings, Frame, Type, Paintbrush, Sliders, Sparkles, ChevronDown } from 'lucide-react';
import { ExcalidrawOptions, CardStyle, LabelPosition, LabelFontFamily } from '../types';
import { ICON_BASE_SIZE } from '../utils/defaultOptions';

interface SidebarOptionsProps {
  options: ExcalidrawOptions;
  setOptions: React.Dispatch<React.SetStateAction<ExcalidrawOptions>>;
}

const BG_COLORS = [
  'rgba(30, 41, 59, 0.8)',
  '#0f172a',
  '#ffffff',
  '#e8f0fe',
  '#e6f4ea',
  '#fef7e0',
  '#fce8e6',
  'transparent',
];

const STROKE_COLORS = [
  '#4285f4',
  '#34a853',
  '#fbbc05',
  '#ea4335',
  '#64748b',
  '#cbd5e1',
  '#1e293b',
  'transparent',
];

const TEXT_COLORS = [
  '#ffffff',
  '#f8fafc',
  '#94a3b8',
  '#4285f4',
  '#34a853',
  '#1e293b',
  '#0f172a',
];

export const SidebarOptions: React.FC<SidebarOptionsProps> = ({ options, setOptions }) => {
  const updateOption = <K extends keyof ExcalidrawOptions>(key: K, value: ExcalidrawOptions[K]) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  const applyPreset = (preset: 'sketch' | 'gcp-dark' | 'gcp-light' | 'minimal') => {
    if (preset === 'sketch') {
      setOptions({
        showCard: true,
        cardStyle: 'sketch-box',
        roughness: 2,
        cardBgColor: 'rgba(30, 41, 59, 0.6)',
        cardStrokeColor: '#4285f4',
        showLabel: true,
        labelPosition: 'bottom',
        labelFontFamily: 1, // Virgil
        labelFontSize: 14,
        labelColor: '#f8fafc',
        iconScale: 1.0,
        padding: 12,
      });
    } else if (preset === 'gcp-dark') {
      setOptions({
        showCard: true,
        cardStyle: 'soft-card',
        roughness: 0,
        cardBgColor: 'rgba(30, 41, 59, 0.8)',
        cardStrokeColor: 'rgba(66, 133, 244, 0.4)',
        showLabel: true,
        labelPosition: 'bottom',
        labelFontFamily: 2, // Sans
        labelFontSize: 13,
        labelColor: '#f8fafc',
        iconScale: 1.0,
        padding: 12,
      });
    } else if (preset === 'gcp-light') {
      setOptions({
        showCard: true,
        cardStyle: 'soft-card',
        roughness: 0,
        cardBgColor: '#ffffff',
        cardStrokeColor: '#cbd5e1',
        showLabel: true,
        labelPosition: 'bottom',
        labelFontFamily: 2,
        labelFontSize: 13,
        labelColor: '#0f172a',
        iconScale: 1.0,
        padding: 12,
      });
    } else if (preset === 'minimal') {
      setOptions({
        showCard: false,
        cardStyle: 'none',
        roughness: 0,
        cardBgColor: 'transparent',
        cardStrokeColor: 'transparent',
        showLabel: true,
        labelPosition: 'bottom',
        labelFontFamily: 2,
        labelFontSize: 12,
        labelColor: '#94a3b8',
        iconScale: 1.0,
        padding: 0,
      });
    }
  };

  // Collapsed only on narrow viewports, where this panel otherwise fills the
  // entire first screen and pushes all 216 icons below the fold. The CSS
  // ignores this class above the breakpoint, so desktop is never collapsed.
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <aside className={`sidebar glass-panel${isOpen ? ' is-open' : ''}`}>
      <button
        className="sidebar-summary"
        onClick={() => setIsOpen(o => !o)}
        aria-expanded={isOpen}
      >
        <Settings size={15} aria-hidden="true" />
        Styling options
        <ChevronDown size={15} className="sidebar-summary-chevron" aria-hidden="true" />
      </button>

      <div className="sidebar-body">
      <div>
        <div className="section-title">
          <Settings className="w-4 h-4 text-blue-400" />
          Presets
        </div>

        <div className="grid grid-cols-2 gap-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => applyPreset('gcp-dark')}
            title="GCP Dark Theme"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            Dark Card
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => applyPreset('sketch')}
            title="Hand-Drawn Sketch Virgil Theme"
          >
            <Paintbrush className="w-3.5 h-3.5 text-yellow-400" />
            Virgil Sketch
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => applyPreset('gcp-light')}
            title="Clean White Card"
          >
            Light Card
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => applyPreset('minimal')}
            title="Icon + Label Only"
          >
            Minimal
          </button>
        </div>
      </div>

      <hr style={{ borderColor: 'var(--border-color)' }} />

      {/* Frame Settings */}
      <div className="control-group">
        <div className="section-title">
          <Frame className="w-4 h-4 text-emerald-400" />
          Bounding Frame / Card
        </div>

        <div className="control-label">
          <span>Show Frame Container</span>
          <input
            type="checkbox"
            checked={options.showCard}
            onChange={e => updateOption('showCard', e.target.checked)}
          />
        </div>

        {options.showCard && (
          <>
            <div className="control-label">Card Style</div>
            <div className="segmented-control">
              {(['soft-card', 'sketch-box', 'outline', 'badge'] as CardStyle[]).map(style => (
                <button
                  key={style}
                  className={`segment-btn ${options.cardStyle === style ? 'active' : ''}`}
                  onClick={() => updateOption('cardStyle', style)}
                >
                  {style === 'soft-card' ? 'Soft' : style === 'sketch-box' ? 'Sketch' : style === 'outline' ? 'Outline' : 'Badge'}
                </button>
              ))}
            </div>

            <div className="control-label">
              Background Color
            </div>
            <div className="color-picker-grid">
              {BG_COLORS.map(c => (
                <div
                  key={c}
                  className={`color-swatch ${options.cardBgColor === c ? 'active' : ''}`}
                  style={{ backgroundColor: c, border: c === 'transparent' ? '1px dashed #64748b' : undefined }}
                  onClick={() => updateOption('cardBgColor', c)}
                />
              ))}
            </div>

            <div className="control-label">
              Stroke Color
            </div>
            <div className="color-picker-grid">
              {STROKE_COLORS.map(c => (
                <div
                  key={c}
                  className={`color-swatch ${options.cardStrokeColor === c ? 'active' : ''}`}
                  style={{ backgroundColor: c, border: c === 'transparent' ? '1px dashed #64748b' : undefined }}
                  onClick={() => updateOption('cardStrokeColor', c)}
                />
              ))}
            </div>

            <div className="control-label">
              <span>Roughness (Hand-Drawn)</span>
              <span className="control-value">{options.roughness}</span>
            </div>
            <div className="segmented-control">
              {[0, 1, 2].map(r => (
                <button
                  key={r}
                  className={`segment-btn ${options.roughness === r ? 'active' : ''}`}
                  onClick={() => updateOption('roughness', r)}
                >
                  {r === 0 ? 'Clean (0)' : r === 1 ? 'Subtle (1)' : 'Sketch (2)'}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <hr style={{ borderColor: 'var(--border-color)' }} />

      {/* Label Settings */}
      <div className="control-group">
        <div className="section-title">
          <Type className="w-4 h-4 text-purple-400" />
          Service Label
        </div>

        <div className="control-label">
          <span>Show Label Text</span>
          <input
            type="checkbox"
            checked={options.showLabel}
            onChange={e => updateOption('showLabel', e.target.checked)}
          />
        </div>

        {options.showLabel && (
          <>
            <div className="control-label">Label Position</div>
            <div className="segmented-control">
              {(['bottom', 'right', 'top', 'inside'] as LabelPosition[]).map(pos => (
                <button
                  key={pos}
                  className={`segment-btn ${options.labelPosition === pos ? 'active' : ''}`}
                  onClick={() => updateOption('labelPosition', pos)}
                >
                  {pos.charAt(0).toUpperCase() + pos.slice(1)}
                </button>
              ))}
            </div>

            <div className="control-label">Font Family</div>
            <div className="segmented-control" style={{ flexWrap: 'wrap' }}>
              {([1, 2, 3, 4, 5] as LabelFontFamily[]).map(font => (
                <button
                  key={font}
                  className={`segment-btn ${options.labelFontFamily === font ? 'active' : ''}`}
                  onClick={() => updateOption('labelFontFamily', font)}
                >
                  {font === 1
                    ? 'Excalifont'
                    : font === 2
                    ? 'Helvetica'
                    : font === 3
                    ? 'Comic Shanns'
                    : font === 4
                    ? 'Lilita One'
                    : 'Nunito'}
                </button>
              ))}
            </div>

            <div className="control-label">
              <span>Font Size</span>
              <span className="control-value">{options.labelFontSize}px</span>
            </div>
            <input
              type="range"
              min="10"
              max="24"
              step="1"
              value={options.labelFontSize}
              onChange={e => updateOption('labelFontSize', Number(e.target.value))}
            />

            <div className="control-label">Label Text Color</div>
            <div className="color-picker-grid">
              {TEXT_COLORS.map(c => (
                <div
                  key={c}
                  className={`color-swatch ${options.labelColor === c ? 'active' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => updateOption('labelColor', c)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <hr style={{ borderColor: 'var(--border-color)' }} />

      {/* Icon Dimensions */}
      <div className="control-group">
        <div className="section-title">
          <Sliders className="w-4 h-4 text-amber-400" />
          Scale & Spacing
        </div>

        <div className="control-label">
          <span>Icon Scale</span>
          <span className="control-value">{Math.round(ICON_BASE_SIZE * options.iconScale)}px ({options.iconScale}x)</span>
        </div>
        <input
          type="range"
          min="0.5"
          max="2.0"
          step="0.25"
          value={options.iconScale}
          onChange={e => updateOption('iconScale', Number(e.target.value))}
        />

        {options.showCard && (
          <>
            <div className="control-label">
              <span>Inner Padding</span>
              <span className="control-value">{options.padding}px</span>
            </div>
            <input
              type="range"
              min="4"
              max="24"
              step="2"
              value={options.padding}
              onChange={e => updateOption('padding', Number(e.target.value))}
            />
          </>
        )}
      </div>
      </div>
    </aside>
  );
};
