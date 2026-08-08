import { useEffect, useMemo } from 'react';
import type { IconAsset, IconSet } from '../../types';
import {
  asBoolean,
  asString,
  asStringArray,
  usePersistentState,
} from '../../hooks/usePersistentState';
import type { IconFilters, IconSelection } from '../../components/IconsToolbar';

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
function matchesQuery(icon: IconAsset, query: string): boolean {
  if (!query) return true;
  return (
    icon.title.toLowerCase().includes(query) ||
    icon.name.toLowerCase().includes(query) ||
    icon.tags.some(tag => tag.includes(query))
  );
}

export function useIconFilters(
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
