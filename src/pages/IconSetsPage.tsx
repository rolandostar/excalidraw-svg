import { useMemo } from 'react';
import { ArrowRight, FolderPlus } from 'lucide-react';
import { Link, iconSetPath } from '../router';
import { listIconSets, totalIconCount } from '../utils/iconSets';

/**
 * Gallery of every icon set found on disk.
 *
 * Cheap by construction: it reads the manifests and the raw markup of the
 * first few files per set, nothing else. No SVG is optimised and nothing is
 * converted until a set is actually opened, so a tenth set costs this page one
 * card rather than another second of SVGO.
 */
export function IconSetsPage() {
  const sets = useMemo(() => listIconSets(), []);
  const total = useMemo(() => totalIconCount(), []);

  return (
    <main className="page page-doc page-sets">
      <header className="doc-header">
        <p className="doc-eyebrow">Icon sets</p>
        <h1 className="doc-title">Ready-made libraries, converted not embedded</h1>
        <p className="doc-lede">
          {sets.length === 0
            ? 'No icon sets found. Drop a folder of SVGs into svg/ to create one.'
            : `${total.toLocaleString()} icons across ${sets.length} set${
                sets.length === 1 ? '' : 's'
              }. Browse a set, restyle the whole thing at once, then copy it straight onto your
                canvas as real editable shapes.`}
        </p>
      </header>

      {sets.length > 0 && (
        <ul className="set-grid">
          {sets.map(set => (
            <li key={set.id} className="set-grid-item">
              <Link
                to={iconSetPath(set.id)}
                className="set-card"
                style={{ ['--set-accent' as string]: set.accent }}
              >
                <div className="set-card-previews" aria-hidden="true">
                  {set.previews.map((src, i) => (
                    <img key={i} src={src} alt="" loading="lazy" decoding="async" />
                  ))}
                </div>

                <div className="set-card-body">
                  <h2 className="set-card-title">
                    <span>{set.name}</span>
                    <span className="set-card-count">{set.count}</span>
                  </h2>

                  {set.description && <p className="set-card-desc">{set.description}</p>}

                  {set.categories.length > 1 && (
                    <div className="set-card-chips">
                      {set.categories.map(category => (
                        <span
                          key={category.id}
                          className="set-card-chip"
                          style={{ borderColor: category.color ?? set.accent }}
                        >
                          {category.name}
                        </span>
                      ))}
                    </div>
                  )}

                  <span className="set-card-cta">
                    Browse and restyle
                    <ArrowRight size={14} aria-hidden="true" />
                  </span>
                </div>
              </Link>

              {(set.sourceUrl || set.source) && (
                <p className="set-card-source">
                  {set.sourceUrl ? (
                    <a href={set.sourceUrl} target="_blank" rel="noreferrer noopener">
                      {set.source ?? set.sourceUrl}
                    </a>
                  ) : (
                    set.source
                  )}
                  {set.license && <span className="set-card-license"> — {set.license}</span>}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <section className="doc-section">
        <h2>
          <FolderPlus size={16} aria-hidden="true" /> Adding your own set
        </h2>
        <p className="doc-body">
          Drop a folder of SVGs into <code>svg/</code>. The folder name becomes the URL — a folder
          called <code>26-gcp</code> is served at <code>/icons/26-gcp</code> — and every file in it
          becomes an icon, titled from its filename. Nothing has to be registered.
        </p>
        <p className="doc-body">
          To name and categorise it, add <code>svg/&lt;folder&gt;/set.json</code>. Every field is
          optional:
        </p>
        <pre className="code-block">{SET_JSON_EXAMPLE}</pre>
        <p className="doc-body">
          <code>rules</code> is ordered and first-wins, matched as substrings against the filename;
          anything unmatched falls through to the last category, so list the catch-all bucket last.{' '}
          <code>synonyms</code> groups are bidirectional — with the group above, the Virtual Private
          Cloud icon is found by searching either <code>vpc</code> or its full name.{' '}
          <code>svg/legacy-gcp/set.json</code> is a complete worked example.
        </p>
      </section>
    </main>
  );
}

const SET_JSON_EXAMPLE = `{
  "name": "Google Cloud 2026",
  "description": "The refreshed product marks.",
  "accent": "#4285F4",
  "order": 20,
  "tags": ["gcp", "google cloud"],
  "categories": [
    { "id": "compute", "name": "Compute", "color": "#81C995" },
    { "id": "general", "name": "General" }
  ],
  "rules": [
    { "category": "compute", "match": ["run", "gke", "engine"] }
  ],
  "synonyms": [
    ["vpc", "virtual private cloud"]
  ],
  "overrides": {
    "weird-file-name": { "title": "Cloud Run", "category": "compute" }
  }
}`;
