import type { ReactNode } from 'react';
import { AlertTriangle, ArrowRight, ExternalLink, Info, type LucideIcon } from 'lucide-react';
import confetti from 'canvas-confetti';
import type { SvgFeatureWarning } from '../convert/support';
import { Link, type RoutePath } from '../router';

/**
 * The small pieces more than one page needs: shared markup, and three
 * one-function helpers that have no better home.
 *
 * Each component here replaced a set of hand-written copies that had already
 * begun to disagree - two glyph sizes on the same card, a `rel` present on
 * five external links and absent on the sixth. Pairing the parts that must
 * agree is the point; none of them is here to save lines.
 */

// ---------------------------------------------------------------------------
// Markup
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * English pluralisation for counted nouns in UI copy.
 *
 * The literal `${n} item${n === 1 ? '' : 's'}` had been written out eight
 * times across the toolbar, the conversion panel and three pages. Each copy
 * was a fresh chance to get the boundary wrong, and two of them already
 * disagreed about whether the count was included in the string. This owns
 * that one decision: the count is always included, and an irregular plural
 * can be given explicitly rather than forcing a caller back to the ternary.
 */
export function plural(n: number, singular: string, pluralForm?: string): string {
  return `${n} ${n === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

/**
 * Saving generated JSON to the user's disk.
 *
 * The toolbar's library export and the convert page's scene download had
 * byte-identical Blob / createObjectURL / synthetic-anchor / revoke bodies.
 * The sequence is easy to write and easy to write *almost* right - forgetting
 * the revoke leaks the blob for the lifetime of the document - so it lives
 * here once rather than being retyped per call site.
 */
export function downloadJson(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * The one confetti burst, in the one set of brand colours.
 *
 * `IconCard` inlined its own `confetti({...})` call with a two-colour literal
 * array while `IconsToolbar` kept a four-colour `GCP_COLORS` constant and a
 * local `celebrate` helper, so the same gesture threw different colours
 * depending on whether one icon or a selection was copied.
 *
 * Also the one place that honours `prefers-reduced-motion`. Confetti is pure
 * motion with no informational content, so a user who has asked for less of it
 * gets none: the toast still fires, which is what actually reports the result.
 */
const GCP_COLORS = ['#4285f4', '#34a853', '#fbbc05', '#ea4335'];

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function celebrate(particleCount = 60): void {
  if (prefersReducedMotion()) return;
  confetti({ particleCount, spread: 65, origin: { y: 0.15 }, colors: GCP_COLORS });
}
