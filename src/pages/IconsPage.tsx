import { useState, useMemo, useEffect, useCallback, useDeferredValue } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ExcalidrawOptions, IconSet } from '../types';
import { findIconSetSummary, loadIconSet } from '../utils/iconSets';
import {
  DEFAULT_EXCALIDRAW_OPTIONS,
  OPTIONS_STORAGE_VERSION,
  looksLikeV1Options,
  migrateOptionsV1,
  normaliseOptions,
} from '../utils/defaultOptions';
import { IconsToolbar } from '../components/IconsToolbar';
import { SidebarOptions } from '../components/SidebarOptions';
import { IconGrid } from '../components/IconGrid';
import { trackWidthFor } from '../components/gridMetrics';
import { Toast } from '../components/Toast';
import { Link } from '../router';
import {
  asBoolean,
  asPartialOf,
  asString,
  asStringArray,
  storageKey,
  usePersistentState,
} from '../hooks/usePersistentState';

interface IconsPageProps {
  setId: string;
}

/**
 * Whatever a pre-v2 build left behind for this set, translated into v2 shape.
 *
 * Used only as the *seed* for the v2 key, so it is overridden the moment a v2
 * value exists. Returns `{}` for anything missing or unparseable - a failed
 * migration must fall through to the set's defaults, never take the page down.
 */
function readLegacyOptions(setId: string): Partial<ExcalidrawOptions> {
  if (typeof window === 'undefined') return {};

  try {
    const stored = window.localStorage.getItem(storageKey(`icons.${setId}.options`));
    if (stored === null) return {};

    const raw: unknown = JSON.parse(stored);
    if (!looksLikeV1Options(raw)) return {};

    /*
     * Only keys the stored object actually had are carried over.
     *
     * `asPartialOf` returns a *complete* object, filling absent keys from the
     * defaults it was given - which is what a restore wants and a migration
     * does not. Left unfiltered, a v1 object with no `labelColor` would arrive
     * carrying the app's grey and overwrite the set's own accent, so migrating
     * would quietly reset colours the user never touched.
     */
    const stale = raw as Record<string, unknown>;
    const merged = asPartialOf(DEFAULT_EXCALIDRAW_OPTIONS as unknown as Record<string, unknown>)(raw);
    const carried: Record<string, unknown> = {};

    if (merged) {
      for (const key of Object.keys(merged)) {
        if (key in stale) carried[key] = merged[key];
      }
    }

    // Keys whose meaning changed are rewritten last and win outright.
    return { ...carried, ...migrateOptionsV1(raw) } as Partial<ExcalidrawOptions>;
  } catch {
    return {};
  }
}

export function IconsPage({ setId }: IconsPageProps) {
  /**
   * Available synchronously, unlike the icons themselves.
   *
   * The styling defaults have to be known on the very first render because
   * they seed `usePersistentState`, and waiting for the set to materialise
   * would mean opening with the wrong look and then snapping.
   */
  const summary = useMemo(() => findIconSetSummary(setId), [setId]);

  const [set, setSet] = useState<IconSet | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Everything the user has set up is restored on reload. Losing a styled
  // selection to an accidental refresh is not acceptable.
  //
  // All of it is namespaced per set, styling included. Sets now declare their
  // own defaults and presets - flat product marks and hand-drawn category
  // badges do not want the same label font - and a single shared styling key
  // would mean the first set opened won, and every other set's declared
  // defaults could never apply.
  const [searchQuery, setSearchQuery] = usePersistentState(`icons.${setId}.search`, '', asString);
  const [activeCategory, setActiveCategory] = usePersistentState(
    `icons.${setId}.category`,
    'all',
    asString
  );
  const [selectedIds, setSelectedIds] = usePersistentState<string[]>(
    `icons.${setId}.selected`,
    [],
    asStringArray
  );
  const [isSelectionMode, setIsSelectionMode] = usePersistentState(
    `icons.${setId}.selectionMode`,
    false,
    asBoolean
  );
  const setDefaults = summary?.defaults ?? DEFAULT_EXCALIDRAW_OPTIONS;

  /*
   * Styling is stored under a versioned key.
   *
   * `asPartialOf` alone cannot carry a v1 object across: it compares `typeof`
   * against the defaults, so it correctly drops `cardStyle` and `roughness`
   * (keys v2 does not have) but happily keeps `labelFontFamily`, whose type is
   * unchanged and whose *meaning* is not - v1's `5` meant Nunito and v2's `5`
   * means Excalifont. Reading a v1 object under the v2 key would silently
   * apply the wrong font and drop the frame style.
   *
   * So v1 is read from its own key, translated, and merged underneath the
   * stored v2 value. The old key is left in place: this runs on every render
   * of a page that can be opened in several tabs, and deleting it would make
   * the migration depend on which tab loaded first.
   */
  const restoreOptions = useCallback(
    (raw: unknown): ExcalidrawOptions | null => {
      const merged = asPartialOf(setDefaults as unknown as Record<string, unknown>)(
        raw
      ) as ExcalidrawOptions | null;
      return merged && normaliseOptions(merged);
    },
    [setDefaults]
  );

  const seedOptions = useMemo(
    () => normaliseOptions({ ...setDefaults, ...readLegacyOptions(setId) }),
    [setId, setDefaults]
  );

  const [options, setOptions] = usePersistentState<ExcalidrawOptions>(
    `icons.${setId}.options.v${OPTIONS_STORAGE_VERSION}`,
    seedOptions,
    restoreOptions
  );

  // Materialising a set runs SVGO over every file in it, so it happens after
  // the first paint rather than blocking it.
  useEffect(() => {
    setIsLoading(true);
    const id = window.setTimeout(() => {
      setSet(loadIconSet(setId));
      setIsLoading(false);
    }, 0);
    return () => window.clearTimeout(id);
  }, [setId]);

  const icons = useMemo(() => set?.icons ?? [], [set]);

  // A stored category can name a bucket this set does not have, and a stored
  // selection can outlive the icon it referred to. Both are pruned once the
  // real set is known so counts never disagree with the grid.
  useEffect(() => {
    if (!set) return;

    setSelectedIds(prev => {
      const known = new Set(set.icons.map(i => i.id));
      const pruned = prev.filter(id => known.has(id));
      return pruned.length === prev.length ? prev : pruned;
    });

    setActiveCategory(prev =>
      prev === 'all' || set.categories.some(c => c.id === prev) ? prev : 'all'
    );
  }, [set, setSelectedIds, setActiveCategory]);

  const filteredIcons = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return icons.filter(icon => {
      if (activeCategory !== 'all' && icon.category !== activeCategory) return false;
      if (!query) return true;
      return (
        icon.title.toLowerCase().includes(query) ||
        icon.name.toLowerCase().includes(query) ||
        icon.tags.some(tag => tag.includes(query))
      );
    });
  }, [icons, searchQuery, activeCategory]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const query = searchQuery.trim().toLowerCase();

    icons.forEach(icon => {
      if (
        !query ||
        icon.title.toLowerCase().includes(query) ||
        icon.name.toLowerCase().includes(query) ||
        icon.tags.some(t => t.includes(query))
      ) {
        counts[icon.category] = (counts[icon.category] || 0) + 1;
      }
    });

    return counts;
  }, [icons, searchQuery]);

  const showToast = useCallback((message: string) => setToast(message), []);

  /**
   * Redrawing the grid costs one SVG conversion and one Excalidraw export per
   * card. A range input fires on every step of a drag, so feeding it straight
   * to the grid pinned the main thread and the slider thumb stopped tracking
   * the pointer. The sidebar keeps the live value - the control stays exact
   * and responsive - while the grid renders at whatever rate it can sustain,
   * skipping the intermediate steps it could not have drawn anyway.
   */
  const gridOptions = useDeferredValue(options);
  const isRestyling = gridOptions !== options;

  /**
   * Column width for the layout currently selected.
   *
   * A bottom-label card is narrower than the minimum track at every icon
   * scale, so this sits at its floor for the common case. A side label is a
   * different shape entirely - up to 400 units across - and squeezing that
   * into a square cell is what used to collapse the artwork to a sliver and
   * break the label mid-word. Widening the track trades columns for cards that
   * are legible and in proportion.
   *
   * Cheap enough to run over the whole set: `measureExcalidrawItem` is
   * arithmetic over the title and the options, with no conversion.
   */
  const trackPx = useMemo(
    () => trackWidthFor(filteredIcons, gridOptions),
    [filteredIcons, gridOptions]
  );

  if (!isLoading && !set) {
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

  return (
    <>
      <div className="main-layout">
        <SidebarOptions
          options={options}
          setOptions={setOptions}
          presets={summary?.presets ?? []}
        />

        <main className="content-area">
          <nav className="set-breadcrumb">
            <Link to="/icons" className="set-breadcrumb-back">
              <ArrowLeft size={14} aria-hidden="true" />
              All icon sets
            </Link>
            {set && (
              <span className="set-breadcrumb-current">
                {set.name}
                {set.description && (
                  <span className="set-breadcrumb-desc">{set.description}</span>
                )}
              </span>
            )}
          </nav>

          <IconsToolbar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            isSelectionMode={isSelectionMode}
            setIsSelectionMode={setIsSelectionMode}
            filteredIcons={filteredIcons}
            allIcons={icons}
            options={options}
            activeCategory={activeCategory}
            setActiveCategory={setActiveCategory}
            categoryCounts={categoryCounts}
            categories={set?.categories ?? []}
            setName={set?.name ?? ''}
            onToast={showToast}
          />

          {isLoading ? (
            <p className="doc-body" role="status">
              Loading and optimising icons…
            </p>
          ) : (
            <div
              className={`grid-region${isRestyling ? ' is-restyling' : ''}`}
              aria-busy={isRestyling}
            >
              <IconGrid
                icons={filteredIcons}
                selectedIds={selectedIds}
                setSelectedIds={setSelectedIds}
                isSelectionMode={isSelectionMode}
                options={gridOptions}
                onToast={showToast}
                trackPx={trackPx}
              />
            </div>
          )}
        </main>
      </div>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
