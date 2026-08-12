import { REPO_URL } from './site';
import { SiteHeader } from './components/SiteHeader';
import { ExternalA } from './components/ui';
import { ConvertPage } from './pages/ConvertPage';
import { IconSetsPage } from './pages/IconSetsPage';
import { IconsPage } from './pages/IconsPage';
import { MethodologyPage } from './pages/MethodologyPage';
import { Link, RouterProvider, iconSetIdFromPath, useRouter } from './router';

/**
 * The fidelity numbers deliberately do not appear here.
 *
 * The landing page already shows the same three figures in its stat strip,
 * one screen above. Printing them twice on one page made both feel like
 * decoration. The link stays; the numbers live where there is room to
 * explain them.
 */
function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p className="site-footer-meta">
          Google Cloud icons are trademarks of Google LLC, redistributed under their
          published usage terms. This project is not affiliated with Google or Excalidraw.
        </p>
        <p className="site-footer-links">
          <Link to="/methodology" className="text-link">
            How it is tested
          </Link>
          <ExternalA className="text-link" href={REPO_URL}>
            Source
          </ExternalA>
        </p>
      </div>
    </footer>
  );
}

function Routes() {
  const { path } = useRouter();

  if (path === '/methodology') return <MethodologyPage />;
  if (path === '/icons') return <IconSetsPage />;

  const setId = iconSetIdFromPath(path);
  // Keyed on the set so switching sets remounts rather than carrying the
  // previous set's selection and scroll position into the new grid.
  if (setId) return <IconsPage key={setId} setId={setId} />;

  return <ConvertPage />;
}

export function App() {
  return (
    <RouterProvider>
      <div className="app-container">
        <SiteHeader />
        <div className="app-body">
          <Routes />
        </div>
        <SiteFooter />
      </div>
    </RouterProvider>
  );
}

export default App;
