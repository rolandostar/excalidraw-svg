import { useState, useMemo, useEffect } from 'react';
import { GCPIcon, ExcalidrawOptions } from '../types';
import { loadAllGCPIcons } from '../utils/svgLoader';
import { DEFAULT_EXCALIDRAW_OPTIONS } from '../utils/defaultOptions';
import { Header } from '../components/Header';
import { SidebarOptions } from '../components/SidebarOptions';
import { CategoryFilter } from '../components/CategoryFilter';
import { IconGrid } from '../components/IconGrid';
import { LivePreviewModal } from '../components/LivePreviewModal';

export function IconsPage() {
  const [icons, setIcons] = useState<GCPIcon[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const [options, setOptions] = useState<ExcalidrawOptions>(DEFAULT_EXCALIDRAW_OPTIONS);

  useEffect(() => {
    setIcons(loadAllGCPIcons());
  }, []);

  const filteredIcons = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return icons.filter(icon => {
      const matchesCategory = activeCategory === 'all' || icon.category === activeCategory;
      if (!matchesCategory) return false;
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

  return (
    <>
      <Header
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
      />

      <div className="main-layout">
        <SidebarOptions options={options} setOptions={setOptions} />

        <main className="content-area">
          <CategoryFilter
            activeCategory={activeCategory}
            setActiveCategory={setActiveCategory}
            categoryCounts={categoryCounts}
            totalCount={icons.length}
          />

          <IconGrid
            icons={filteredIcons}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            isSelectionMode={isSelectionMode}
            options={options}
          />
        </main>
      </div>

      <LivePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        icons={selectedIds.length > 0 ? icons.filter(i => selectedIds.includes(i.id)) : filteredIcons}
        options={options}
      />
    </>
  );
}
