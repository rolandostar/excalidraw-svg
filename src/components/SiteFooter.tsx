import { Link } from '../router';
import { REPO_URL, STATS, formatPct } from '../site';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p className="site-footer-claim">
          {STATS.iconCount} icons at {formatPct(STATS.iconMeanError)} mean shape error ·{' '}
          {STATS.tortureCount} torture cases · {STATS.tortureFailures} known failures.{' '}
          <Link to="/methodology" className="text-link">
            Every number here is measured, not asserted.
          </Link>
        </p>
        <p className="site-footer-meta">
          Google Cloud icons are trademarks of Google LLC, redistributed under their
          published usage terms. This project is not affiliated with Google or Excalidraw.{' '}
          <a className="text-link" href={REPO_URL} target="_blank" rel="noreferrer noopener">
            Source
          </a>
        </p>
      </div>
    </footer>
  );
}
