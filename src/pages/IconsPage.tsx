import { useDeferredValue, useMemo } from 'react';
import { findIconSetSummary } from '../utils/iconSets';
import { IconsToolbar } from '../components/IconsToolbar';
import { SidebarOptions } from '../components/SidebarOptions';
import { IconGrid } from '../components/IconGrid';
import { trackWidthFor } from '../components/gridMetrics';
import { ToastProvider } from '../components/Toast';
import { SetBreadcrumb } from './icons/SetBreadcrumb';
import { SetNotFound } from './icons/SetNotFound';
import { useIconSetOptions } from './icons/useIconSetOptions';
import { useIconSetData } from './icons/useIconSetData';
import { useIconFilters } from './icons/useIconFilters';

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
