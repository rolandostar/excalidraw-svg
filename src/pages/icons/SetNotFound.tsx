import { Link } from '../../router';

/**
 * What a URL naming a set that does not exist resolves to.
 *
 * A set is a folder under `svg/`, so this is reachable by a stale bookmark, a
 * renamed folder or a typed path. It explains where sets come from rather than
 * just reporting a 404, because in this app the fix is usually "add the
 * folder".
 */
export function SetNotFound({ setId }: { setId: string }) {
  return (
    <main className="page page-doc">
      <header className="doc-header">
        <p className="doc-eyebrow">Icon sets</p>
        <h1 className="doc-title">No set called “{setId}”</h1>
        <p className="doc-lede">
          Icon sets are folders under <code>svg/</code>. Either this one was renamed, or the
          folder has not been added yet.
        </p>
      </header>
      <p className="doc-body" style={{ marginTop: '1.5rem' }}>
        <Link to="/icons" className="text-link">
          Back to all icon sets
        </Link>
      </p>
    </main>
  );
}
