import { useState, useMemo, useEffect, useCallback } from 'react';
import { GCPIcon, ExcalidrawOptions } from '../types';
import { loadAllGCPIcons } from '../utils/svgLoader';
import { DEFAULT_EXCALIDRAW_OPTIONS } from '../utils/defaultOptions';
import { CATEGORIES } from '../utils/categorizer';
import { IconsToolbar } from '../components/IconsToolbar';
import { SidebarOptions } from '../components/SidebarOptions';
import { IconGrid } from '../components/IconGrid';
import { LivePreviewModal } from '../components/LivePreviewModal';
import { Toast } from '../components/Toast';
import {
  asBoolean,
  asOneOf,
  asPartialOf,
  asString,
  asStringArray,
  usePersistentState,
} from '../hooks/usePersistentState';

const CATEGORY_IDS = ['all', ...Object.keys(CATEGORIES)] as const;

export function IconsPage() {
  const [icons, setIcons] = useState<GCPIcon[]>([]);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Everything the user has set up is restored on reload. Losing a styled
  // 216-icon selection to an accidental refresh is not acceptable.
  const [searchQuery, setSearchQuery] = usePersistentState('icons.search', '', asString);
  const [activeCategory, setActiveCategory] = usePersistentState(
    'icons.category',
    'all',
    asOneOf(CATEGORY_IDS)
  );
  const [selectedIds, setSelectedIds] = usePersistentState<string[]>(
    'icons.selected',
    [],
    asStringArray
  );
  const [isSelectionMode, setIsSelectionMode] = usePersistentState(
    'icons.selectionMode',
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

  useEffect(() => {
    setIcons(loadAllGCPIcons());
  }, []);

  // A stored selection can outlive the icon it referred to. Prune once the
  // real set is known so counts and exports never disagree with the grid.
  useEffect(() => {
    if (icons.length === 0) return;
    setSelectedIds(prev => {
      const known = new Set(icons.map(i => i.id));
      const pruned = prev.filter(id => known.has(id));
      return pruned.length === prev.length ? prev : pruned;
    });
  }, [icons, setSelectedIds]);

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
        icon.tags.some(t => t.includes(query))
      ) {
        counts[icon.category] = (counts[icon.category] || 0) + 1;
      }
    });

    return counts;
  }, [icons, searchQuery]);

  const showToast = useCallback((message: string) => setToast(message), []);

  return (
    <>
      <div className="main-layout">
        <SidebarOptions options={options} setOptions={setOptions} />

        <main className="content-area">
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
            onToast={showToast}
          />

          <IconGrid
            icons={filteredIcons}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            isSelectionMode={isSelectionMode}
            options={options}
            onToast={showToast}
          />
        </main>
      </div>

      <LivePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        icons={selectedIds.length > 0 ? icons.filter(i => selectedIds.includes(i.id)) : filteredIcons}
        options={options}
      />

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
