import type { ReactNode } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import type { SvgFeatureWarning } from '../utils/svgSupport';

/**
 * The boxed callout used to report what a conversion could not do.
 *
 * `ConversionResult` carried four hand-written copies of the same markup -
 * icon, title paragraph, list - differing only in the severity class and which
 * lucide glyph was hardcoded beside it. Pairing the icon with the severity in
 * one place is the point: a `notice-warn` box with a red `AlertTriangle` in it
 * was already possible, and reads as an error the stylesheet then contradicts.
 */
type Severity = 'error' | 'warn';

const ICONS: Record<Severity, typeof AlertTriangle> = {
  error: AlertTriangle,
  warn: Info,
};

export function Notice({
  severity,
  title,
  children,
}: {
  severity: Severity;
  title: ReactNode;
  children?: ReactNode;
}) {
  const Glyph = ICONS[severity];

  return (
    <div className={`notice notice-${severity}`}>
      <Glyph size={16} aria-hidden="true" />
      <div>
        <p className="notice-title">{title}</p>
        {children}
      </div>
    </div>
  );
}

/**
 * A detected-feature list: `<code>feature</code> ×count — detail`.
 *
 * Rendered identically for `unsupported` and `approximated`; only the
 * surrounding `Notice` differs. `feature` is unique per severity bucket
 * because the detector aggregates by rule, so it is a safe key.
 */
export function WarningList({ warnings }: { warnings: SvgFeatureWarning[] }) {
  return (
    <ul className="notice-list">
      {warnings.map(w => (
        <li key={w.feature}>
          <code>{w.feature}</code> &times;{w.count} — {w.detail}
        </li>
      ))}
    </ul>
  );
}
