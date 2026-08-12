import { Github, Monitor, Moon, Sun } from 'lucide-react';
import { Link, useRouter, type RoutePath } from '../router';
import { REPO_URL } from '../site';
import { ExternalA } from './ui';
import { useTheme, type ThemePreference } from '../hooks';

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
          {/*
            A diagram node with the corner overshoot Rough.js draws, wired on
            both sides. The overshoot is what makes it read as hand-drawn
            rather than as a checkbox, and the two leads are what make it read
            as a diagram rather than as a square. Symmetric so it centres in
            the badge, and it still resolves at the 16px favicon size.
          */}
          <svg
            viewBox="0 0 24 24"
            width="19"
            height="19"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M7 6.4C9.6 6 14.4 6.4 17.2 6.1" />
            <path d="M16.9 7.6c.4 2.4 0 6.4.2 8.8" />
            <path d="M15.4 16.2c-2.6.3-7.4-.1-9.8.1" />
            <path d="M5.9 15.2c-.4-2.6.1-6.6-.2-9" />
            <path d="M1.8 11.2h3.8M17.4 11.2h3.8" />
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
