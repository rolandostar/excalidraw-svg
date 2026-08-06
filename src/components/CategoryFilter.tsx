import React from 'react';
import { CATEGORIES } from '../utils/categorizer';

interface CategoryFilterProps {
  activeCategory: string;
  setActiveCategory: (catId: string) => void;
  categoryCounts: Record<string, number>;
  totalCount: number;
}

export const CategoryFilter: React.FC<CategoryFilterProps> = ({
  activeCategory,
  setActiveCategory,
  categoryCounts,
  totalCount,
}) => {
  return (
    <div className="category-bar">
      <button
        className={`category-chip ${activeCategory === 'all' ? 'active' : ''}`}
        onClick={() => setActiveCategory('all')}
      >
        All Categories
        <span className="count-badge">{totalCount}</span>
      </button>

      {Object.values(CATEGORIES).map(cat => {
        const count = categoryCounts[cat.id] || 0;
        return (
          <button
            key={cat.id}
            className={`category-chip ${activeCategory === cat.id ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat.id)}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: cat.badgeColor }}
            />
            {cat.name}
            <span className="count-badge">{count}</span>
          </button>
        );
      })}
    </div>
  );
};
