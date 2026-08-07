import { SiteHeader } from './components/SiteHeader';
import { SiteFooter } from './components/SiteFooter';
import { ConvertPage } from './pages/ConvertPage';
import { IconSetsPage } from './pages/IconSetsPage';
import { IconsPage } from './pages/IconsPage';
import { MethodologyPage } from './pages/MethodologyPage';
import { RouterProvider, iconSetIdFromPath, useRouter } from './router';

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
