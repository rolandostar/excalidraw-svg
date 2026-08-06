import React from 'react';
import { Check } from 'lucide-react';
import { GCPIcon, ExcalidrawOptions } from '../types';
import { buildExcalidrawClipboardData } from '../utils/excalidrawGenerator';
import confetti from 'canvas-confetti';

interface IconCardProps {
  icon: GCPIcon;
  isSelected: boolean;
  isSelectionMode: boolean;
  onToggleSelect: (id: string) => void;
  options: ExcalidrawOptions;
}

export const IconCard: React.FC<IconCardProps> = ({
  icon,
  isSelected,
  isSelectionMode,
  onToggleSelect,
  options,
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopySingle = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const { jsonText } = buildExcalidrawClipboardData([icon], options);
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);

      confetti({
        particleCount: 25,
        spread: 40,
        origin: { y: 0.2 },
        colors: ['#4285F4', '#34A853'],
      });
    } catch (err) {
      console.error('Failed to copy single icon:', err);
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (isSelectionMode) {
      onToggleSelect(icon.id);
    } else {
      handleCopySingle(e);
    }
  };

  const iconSize = Math.round(48 * options.iconScale);

  // Compute font family CSS rule
  const fontFamilyCss =
    options.labelFontFamily === 1
      ? "'Excalifont', 'Kalam', cursive"
      : options.labelFontFamily === 3
      ? "'Comic Shanns', 'JetBrains Mono', monospace"
      : options.labelFontFamily === 4
      ? "'Lilita One', cursive"
      : options.labelFontFamily === 5
      ? "'Nunito', sans-serif"
      : "'Helvetica', 'Inter', sans-serif";

  return (
    <div
      className={`icon-card ${isSelected ? 'selected' : ''} ${copied ? 'copied-flash' : ''}`}
      onClick={handleCardClick}
      title={isSelectionMode ? 'Click to select' : 'Click anywhere to copy to Excalidraw'}
    >
      {/* Toast Feedback for instant copy */}
      {copied && (
        <div className="copy-toast">
          <Check className="w-3.5 h-3.5 text-green-400" />
          <span>Copied!</span>
        </div>
      )}

      {/* Selection Checkbox (Visible in Selection Mode or when selected) */}
      {(isSelectionMode || isSelected) && (
        <div className="checkbox-container">
          <div className="checkbox-custom">
            {isSelected && <Check className="w-3 h-3 text-white" />}
          </div>
        </div>
      )}

      {/* Live Excalidraw Container Preview Box */}
      <div
        className="icon-preview-box"
        style={{
          backgroundColor: options.showCard ? options.cardBgColor : 'transparent',
          borderWidth: options.showCard && options.cardStyle !== 'none' ? '1px' : '0px',
          borderStyle: options.cardStyle === 'sketch-box' ? 'dashed' : 'solid',
          borderColor: options.cardStrokeColor,
          borderRadius:
            options.showCard && (options.cardStyle === 'soft-card' || options.cardStyle === 'badge')
              ? '12px'
              : '0px',
          padding: options.showCard ? `${options.padding}px` : '0px',
          display: 'flex',
          flexDirection:
            options.labelPosition === 'right'
              ? 'row'
              : options.labelPosition === 'top'
              ? 'column-reverse'
              : 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
        }}
      >
        <img
          src={icon.dataUrl}
          alt={icon.title}
          style={{
            width: `${iconSize}px`,
            height: `${iconSize}px`,
            objectFit: 'contain',
          }}
        />

        {/* Non-editable Excalidraw Label (Visible inside container when showLabel is ON) */}
        {options.showLabel && (
          <span
            className="icon-title-text"
            style={{
              fontSize: `${options.labelFontSize}px`,
              color: options.labelColor,
              fontFamily: fontFamilyCss,
            }}
          >
            {icon.title}
          </span>
        )}
      </div>

      {/* Non-editable Web UI Caption (Displayed when Excalidraw Label is OFF) */}
      {!options.showLabel && (
        <div className="icon-ui-caption">
          <span className="subtle-caption-text">{icon.title}</span>
        </div>
      )}
    </div>
  );
};
