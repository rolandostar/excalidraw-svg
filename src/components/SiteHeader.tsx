import { Github } from 'lucide-react';
import { Link, useRouter, type RoutePath } from '../router';
import { REPO_URL } from '../site';
import { ThemeToggle } from './ThemeToggle';

const NAV: { to: RoutePath; label: string }[] = [
  { to: '/', label: 'Convert' },
  { to: '/icons', label: 'Icon sets' },
  { to: '/methodology', label: 'How we test' },
];

/**
 * `/icons/legacy-gcp` is still the icons section, so the tab has to stay lit
 * while a single set is open, not just on the gallery itself.
 */
function isActive(path: RoutePath, item: RoutePath): boolean {
  if (path === item) return true;
  return item !== '/' && path.startsWith(`${item}/`);
}

export function SiteHeader() {
  const { path } = useRouter();

  return (
    <header className="site-header">
      <Link to="/" className="site-brand" aria-label="Home">
        <span className="site-brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 17 L10 5 L14 13 L17 9 L20 17" />
          </svg>
        </span>
        <span className="site-brand-text">
          svg<span className="site-brand-arrow">&rarr;</span>excalidraw
        </span>
      </Link>

      <nav className="site-nav" aria-label="Primary">
        {NAV.map(item => (
          <Link
            key={item.to}
            to={item.to}
            className={`site-nav-link${isActive(path, item.to) ? ' is-active' : ''}`}
            aria-current={path === item.to ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="site-header-end">
        <ThemeToggle />
        <a
          className="site-nav-link site-nav-external"
          href={REPO_URL}
          target="_blank"
          rel="noreferrer noopener"
        >
          <Github size={15} aria-hidden="true" />
          <span className="site-nav-external-label">GitHub</span>
        </a>
      </div>
    </header>
  );
}
