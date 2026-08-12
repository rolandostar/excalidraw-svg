import type { ReactNode } from 'react';
import { AlertTriangle, ArrowRight, ExternalLink, Info, type LucideIcon } from 'lucide-react';
import type { SvgFeatureWarning } from '../utils/svgSupport';
import { Link, type RoutePath } from '../router';

/**
 * The small pieces of markup that more than one page renders.
 *
 * Each of these replaced a set of hand-written copies that had already begun
 * to disagree with each other - two glyph sizes on the same card, a `rel`
 * present on five external links and absent on the sixth. Pairing the parts
 * that must agree in one component is the point; none of them is here to save
 * lines.
 */

/**
 * The boxed callout used to report what a conversion could not do.
 *
 * Pairing the icon with the severity is the point: a `notice-warn` box with a
 * red `AlertTriangle` in it was already possible, and reads as an error the
 * stylesheet then contradicts.
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

/**
 * One figure in a stat strip.
 *
 * Two of the seven copies this replaced rendered the same number on two
 * different pages, and nothing tied them together.
 */
export function Stat({ value, children }: { value: ReactNode; children: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{children}</span>
    </div>
  );
}

/**
 * Anchor to somewhere off this site.
 *
 * `rel="noreferrer noopener"` was written out at every call site, which makes
 * omitting it a one-character mistake with a security consequence.
 */
export function ExternalA({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a href={href} className={className} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  );
}

/**
 * The large "go here next" card at the foot of a page.
 *
 * Internal and external destinations render the same card with a different
 * trailing glyph - an arrow stays on the site, the external mark leaves it -
 * so which one is drawn follows from `to` versus `href` rather than being
 * chosen by hand. The three copies this replaced had drifted to two arrow
 * sizes.
 */
export function NextCard({
  icon: Icon,
  title,
  children,
  to,
  href,
}: {
  icon: LucideIcon;
  title: ReactNode;
  children: ReactNode;
  to?: RoutePath;
  href?: string;
}) {
  const body = (
    <>
      <span className="next-card-icon">
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="next-card-body">
        <span className="next-card-title">
          {title}{' '}
          {to ? <ArrowRight size={15} aria-hidden="true" /> : <ExternalLink size={14} aria-hidden="true" />}
        </span>
        <span className="next-card-text">{children}</span>
      </span>
    </>
  );

  return to ? (
    <Link to={to} className="next-card">
      {body}
    </Link>
  ) : (
    <ExternalA href={href!} className="next-card">
      {body}
    </ExternalA>
  );
}
