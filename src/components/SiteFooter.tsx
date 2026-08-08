import { Link } from '../router';
import { REPO_URL } from '../site';

/**
 * The fidelity numbers deliberately do not appear here.
 *
 * The landing page already shows the same three figures in its stat strip,
 * one screen above. Printing them twice on one page made both feel like
 * decoration. The link stays; the numbers live where there is room to
 * explain them.
 */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p className="site-footer-meta">
          Google Cloud icons are trademarks of Google LLC, redistributed under their
          published usage terms. This project is not affiliated with Google or Excalidraw.
        </p>
        <p className="site-footer-links">
          <Link to="/methodology" className="text-link">
            How it is tested
          </Link>
          <a className="text-link" href={REPO_URL} target="_blank" rel="noreferrer noopener">
            Source
          </a>
        </p>
      </div>
    </footer>
  );
}
