import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { ExcalidrawOptions } from '../types/options';
import type { IconAsset, IconSet, IconSetSummary } from '../types/icons';
import { ArrowLeft } from 'lucide-react';
import { Link } from '../router';
import { asBoolean, asPartialOf, asString, asStringArray, storageKey, usePersistentState } from '../hooks';
import {
  DEFAULT_EXCALIDRAW_OPTIONS,
  OPTIONS_STORAGE_VERSION,
  looksLikeV1Options,
  migrateOptionsV1,
  normaliseOptions,
} from '../scene/options';
import { findIconSetSummary, loadIconSet } from '../library/iconSets';
import { IconsToolbar, type IconFilters, type IconSelection } from '../components/IconsToolbar';
import { SidebarOptions } from '../components/SidebarOptions';
import { IconGrid } from '../components/IconGrid';
import { ToastProvider } from '../components/Toast';
import { trackWidthFor } from '../components/gridMetrics';

/**
 * One icon set: its icons, the filters over them, and the styling panel.
 *
 * Everything below the page component is local to it - a v1 options
 * migration, two pieces of persisted state and two small pieces of chrome.
 * None had another caller.
 */

// ---------------------------------------------------------------------------
// Persisted state
// ---------------------------------------------------------------------------

/**
 * Reading the pre-v2 styling key out of localStorage.
 *
 * Isolated here because it is the only part of the icons page that has to know
 * anything about a storage format the app no longer writes, and because it is
 * the part most likely to be deleted outright once enough time has passed.
 */

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

/**
 * The styling options for one set: where they come from, how they are stored,
 * and how a stored value is validated on the way back in.
 *
 * All of it is namespaced per set. Sets declare their own defaults and presets
 * - flat product marks and hand-drawn category badges do not want the same
 * label font - and a single shared styling key would mean the first set opened
 * won, and every other set's declared defaults could never apply.
 */
function useIconSetOptions(
  setId: string,
  summary: IconSetSummary | null | undefined
): [ExcalidrawOptions, Dispatch<SetStateAction<ExcalidrawOptions>>] {
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

  return usePersistentState<ExcalidrawOptions>(
    `icons.${setId}.options.v${OPTIONS_STORAGE_VERSION}`,
    seedOptions,
    restoreOptions
  );
}

/**
 * What the user is looking at within a set: the search box, the category chip,
 * and the selection.
 *
 * All four are persisted per set. Losing a styled selection to an accidental
 * refresh is not acceptable, and namespacing per set is what stops one set's
 * search from filtering another's grid.
 *
 * Takes the loaded `set` as well as its id because a stored filter can outlive
 * the thing it named; see the prune effect.
 */

/**
 * The one search predicate.
 *
 * `filteredIcons` and `categoryCounts` each had their own copy of this
 * three-way title/name/tags test, so the count on a chip could disagree with
 * the number of cards behind it the moment either was edited alone. `query` is
 * expected pre-trimmed and pre-lowercased; an empty one matches everything.
 */
// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

function matchesQuery(icon: IconAsset, query: string): boolean {
  if (!query) return true;
  return (
    icon.title.toLowerCase().includes(query) ||
    icon.name.toLowerCase().includes(query) ||
    icon.tags.some(tag => tag.includes(query))
  );
}

function useIconFilters(
  setId: string,
  set: IconSet | null,
  icons: IconAsset[]
): { filters: IconFilters; selection: IconSelection; filteredIcons: IconAsset[] } {
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

  const query = searchQuery.trim().toLowerCase();

  const filteredIcons = useMemo(
    () =>
      icons.filter(
        icon =>
          (activeCategory === 'all' || icon.category === activeCategory) &&
          matchesQuery(icon, query)
      ),
    [icons, query, activeCategory]
  );

  // Counted across every category, not just the active one: the chips have to
  // show what switching to them would give you.
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const icon of icons) {
      if (matchesQuery(icon, query)) {
        counts[icon.category] = (counts[icon.category] || 0) + 1;
      }
    }

    return counts;
  }, [icons, query]);

  return {
    filters: {
      searchQuery,
      setSearchQuery,
      activeCategory,
      setActiveCategory,
      categoryCounts,
      categories: set?.categories ?? [],
    },
    selection: { selectedIds, setSelectedIds, isSelectionMode, setIsSelectionMode },
    filteredIcons,
  };
}

/**
 * The way back to the gallery, plus the name of the set currently open.
 *
 * `set` is nullable because the breadcrumb renders during the load: the way
 * back has to be available before the icons are, or the only escape from a
 * slow set is the browser's own back button.
 */
// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

function SetBreadcrumb({ set }: { set: IconSet | null }) {
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

/**
 * What a URL naming a set that does not exist resolves to.
 *
 * A set is a folder under `svg/`, so this is reachable by a stale bookmark, a
 * renamed folder or a typed path. It explains where sets come from rather than
 * just reporting a 404, because in this app the fix is usually "add the
 * folder".
 */
function SetNotFound({ setId }: { setId: string }) {
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

/**
 * One icon set, browsable and restylable.
 *
 * This file is the arrangement only: the three hooks below own the set's
 * icons, its styling options and its filters respectively, and each of those
 * keeps its own state. What is left here is what genuinely spans them - the
 * deferred copy of the options the grid draws with, and the column width
 * derived from both the filtered icons and those options.
 */
interface IconsPageProps {
  setId: string;
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

/**
 * Materialising a set's icons, off the first-paint critical path.
 */
function useIconSetData(setId: string): {
  set: IconSet | null;
  isLoading: boolean;
  icons: IconAsset[];
} {
  const [set, setSet] = useState<IconSet | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  // Identity-stable while the set is unchanged, so the filter memos below it
  // are not invalidated by the empty-array fallback being re-allocated.
  const icons = useMemo(() => set?.icons ?? [], [set]);

  return { set, isLoading, icons };
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

  const { set, isLoading, icons } = useIconSetData(setId);
  const [options, setOptions] = useIconSetOptions(setId, summary);
  const { filters, selection, filteredIcons } = useIconFilters(setId, set, icons);

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

  if (!isLoading && !set) return <SetNotFound setId={setId} />;

  return (
    <ToastProvider>
      <div className="main-layout">
        <SidebarOptions
          options={options}
          setOptions={setOptions}
          presets={summary?.presets ?? []}
        />

        <main className="content-area">
          <SetBreadcrumb set={set} />

          <IconsToolbar
            filters={filters}
            selection={selection}
            library={{
              all: icons,
              filtered: filteredIcons,
              options,
              setName: set?.name ?? '',
            }}
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
                selection={selection}
                options={gridOptions}
                trackPx={trackPx}
              />
            </div>
          )}
        </main>
      </div>
    </ToastProvider>
  );
}
