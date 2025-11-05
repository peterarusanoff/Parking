import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Building2, LayoutDashboard, Shield } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import './App.css';
import { Button } from './components/ui/button';
import './index.css';
import { AdminPage } from './pages/AdminPage';
import { GlobalAdmin } from './pages/GlobalAdmin';
import { RBAC } from './pages/RBAC';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  const [route, setRoute] = useState<string>(
    () => window.location.hash || '#/global'
  );

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash || '#/global');
    window.addEventListener('hashchange', onHashChange);
    if (!window.location.hash) window.location.hash = '#/global';
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const Page = useMemo(() => {
    if (route.startsWith('#/rbac')) return RBAC;
    if (route.startsWith('#/admin')) return AdminPage;
    return GlobalAdmin;
  }, [route]);

  const isActive = (path: string) => route.startsWith(path);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="app">
        <header className="app-header">
          <h1>🅿️ VendPark Dashboard</h1>
          <p className="mt-2">Multi-tenant parking management & analytics</p>
        </header>

        <nav className="border-b border-border bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/50">
          <div className="container mx-auto px-4 py-3 flex gap-1 justify-center">
            <Button 
              variant={isActive('#/global') ? 'secondary' : 'ghost'} 
              asChild
              className="gap-2"
            >
              <a href="#/global">
                <LayoutDashboard className="h-4 w-4" />
                Global Admin
              </a>
            </Button>
            <Button 
              variant={isActive('#/rbac') ? 'secondary' : 'ghost'} 
              asChild
              className="gap-2"
            >
              <a href="#/rbac">
                <Shield className="h-4 w-4" />
                RBAC
              </a>
            </Button>
            <Button 
              variant={isActive('#/admin') ? 'secondary' : 'ghost'} 
              asChild
              className="gap-2"
            >
              <a href="#/admin">
                <Building2 className="h-4 w-4" />
                Garage Admin
              </a>
            </Button>
          </div>
        </nav>

        <main className="app-main">
          <Page />
        </main>
      </div>
    </QueryClientProvider>
  );
}

export default App;
