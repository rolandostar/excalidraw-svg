import { Monitor, Moon, Sun } from 'lucide-react';
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
export function ThemeToggle() {
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
