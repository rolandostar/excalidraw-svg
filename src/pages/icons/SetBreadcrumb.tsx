import { ArrowLeft } from 'lucide-react';
import type { IconSet } from '../../types/icons';
import { Link } from '../../router';

/**
 * The way back to the gallery, plus the name of the set currently open.
 *
 * `set` is nullable because the breadcrumb renders during the load: the way
 * back has to be available before the icons are, or the only escape from a
 * slow set is the browser's own back button.
 */
export function SetBreadcrumb({ set }: { set: IconSet | null }) {
  return (
    <nav className="set-breadcrumb">
      <Link to="/icons" className="set-breadcrumb-back">
        <ArrowLeft size={14} aria-hidden="true" />
        All icon sets
      </Link>
      {set && (
        <span className="set-breadcrumb-current">
          {set.name}
          {set.description && <span className="set-breadcrumb-desc">{set.description}</span>}
        </span>
      )}
    </nav>
  );
}
