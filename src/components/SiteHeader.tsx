import { Github, Monitor, Moon, Sun } from 'lucide-react';
import { Link, useRouter, type RoutePath } from '../router';
import { REPO_URL } from '../site';
import { ExternalA } from './ui';
import { useTheme, type ThemePreference } from '../hooks/useTheme';

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'system', label: 'Follow system', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
];

/**
 * Three explicit states rather than a two-way switch.
 *
 * A plain light/dark toggle has no way to express "follow the system", so the
 * first click permanently opts the user out of it without saying so. Showing
 * all three makes the current mode visible and the system option reachable
 * again after it has been left.
 */
function ThemeToggle() {
  const { preference, setPreference, resolved } = useTheme();

  return (
    <div
      className="theme-toggle"
      role="radiogroup"
      aria-label={`Colour theme, currently ${preference}${
        preference === 'system' ? ` (${resolved})` : ''
      }`}
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          aria-label={label}
          title={label}
          className={`theme-toggle-btn${preference === value ? ' is-active' : ''}`}
          onClick={() => setPreference(value)}
        >
          <Icon size={14} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

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
        <ExternalA className="site-nav-link site-nav-external" href={REPO_URL}>
          <Github size={15} aria-hidden="true" />
          <span className="site-nav-external-label">GitHub</span>
        </ExternalA>
      </div>
    </header>
  );
}
