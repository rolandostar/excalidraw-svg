import { useMemo } from 'react';
import { ArrowRight, FolderPlus } from 'lucide-react';
import { Link, iconSetPath } from '../router';
import { WIKI_URL } from '../site';
import { ExternalA, NextCard , plural } from '../components/ui';
import { listIconSets, totalIconCount } from '../library/iconSets';

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
            : `${total.toLocaleString()} icons across ${plural(sets.length, 'set')}. Browse a
                set, restyle the whole thing at once, then copy it straight onto your canvas
                as real editable shapes.`}
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
                    <ExternalA href={set.sourceUrl}>{set.source ?? set.sourceUrl}</ExternalA>
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

      {/*
        The set.json schema is NOT repeated here.

        It used to exist three times - on this page, in the README and in the
        types - and the three had already started to drift. The wiki page is
        the one copy, and it is the one a contributor can edit.
      */}
      <NextCard
        href={`${WIKI_URL}/Submit-an-icon-set`}
        icon={FolderPlus}
        title="Add your own set"
      >
        Drop a folder of SVGs into <code>svg/</code> and it appears here. The folder name
        becomes the URL. Naming, categories and search aliases are optional — the guide
        covers all of it.
      </NextCard>
    </main>
  );
}
