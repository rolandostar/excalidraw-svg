import { SiteHeader } from './components/SiteHeader';
import { SiteFooter } from './components/SiteFooter';
import { ConvertPage } from './pages/ConvertPage';
import { IconsPage } from './pages/IconsPage';
import { MethodologyPage } from './pages/MethodologyPage';
import { RouterProvider, useRouter } from './router';

function Routes() {
  const { path } = useRouter();

  switch (path) {
    case '/icons':
      return <IconsPage />;
    case '/methodology':
      return <MethodologyPage />;
    default:
      return <ConvertPage />;
  }
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
