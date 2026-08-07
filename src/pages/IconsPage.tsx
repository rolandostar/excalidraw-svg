import { useState, useMemo, useEffect, useCallback, useDeferredValue } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ExcalidrawOptions, IconSet } from '../types';
import { loadIconSet } from '../utils/iconSets';
import { DEFAULT_EXCALIDRAW_OPTIONS } from '../utils/defaultOptions';
import { IconsToolbar } from '../components/IconsToolbar';
import { SidebarOptions } from '../components/SidebarOptions';
import { IconGrid } from '../components/IconGrid';
import { LivePreviewModal } from '../components/LivePreviewModal';
import { Toast } from '../components/Toast';
import { Link } from '../router';
import {
  asBoolean,
  asPartialOf,
  asString,
  asStringArray,
  usePersistentState,
} from '../hooks/usePersistentState';

interface IconsPageProps {
  setId: string;
}

export function IconsPage({ setId }: IconsPageProps) {
  const [set, setSet] = useState<IconSet | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Everything the user has set up is restored on reload. Losing a styled
  // selection to an accidental refresh is not acceptable.
  //
  // Search, category and selection are namespaced per set: they describe a
  // specific corpus, and leaking a GCP selection into another pack would show
  // a count that matches nothing on screen. Style options are deliberately
  // *not* namespaced - a look you have dialled in should follow you between
  // sets.
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
  const [options, setOptions] = usePersistentState<ExcalidrawOptions>(
    'icons.options',
    DEFAULT_EXCALIDRAW_OPTIONS,
    asPartialOf(DEFAULT_EXCALIDRAW_OPTIONS as unknown as Record<string, unknown>) as (
      raw: unknown
    ) => ExcalidrawOptions | null
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

  const previewIcons = useMemo(() => {
    if (selectedIds.length === 0) return filteredIcons;
    const selected = new Set(selectedIds);
    return icons.filter(i => selected.has(i.id));
  }, [icons, filteredIcons, selectedIds]);

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
        <SidebarOptions options={options} setOptions={setOptions} />

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
            onOpenPreview={() => setIsPreviewOpen(true)}
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
              />
            </div>
          )}
        </main>
      </div>

      {/* Mounted only while open: its memos run `parseSvgToExcalidrawElements`
          and stringify the whole clipboard payload, and the early `return null`
          sits after the hooks, so a closed modal still paid for every keystroke
          and every slider step. */}
      {isPreviewOpen && (
        <LivePreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          icons={previewIcons}
          options={options}
        />
      )}

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
