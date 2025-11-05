import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import './App.css';
import { Dashboard } from './components/Dashboard';
import { GarageSelector } from './components/GarageSelector';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  const [selectedGarageId, setSelectedGarageId] = useState<string | null>(null);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="app">
        <header className="app-header">
          <h1>🅿️ Vend Parking Dashboard</h1>
          <p>Multi-tenant billing & reporting</p>
        </header>

        <main className="app-main">
          <GarageSelector
            selectedGarageId={selectedGarageId}
            onSelectGarage={setSelectedGarageId}
          />

          {selectedGarageId ? (
            <Dashboard garageId={selectedGarageId} />
          ) : (
            <div className="empty-state">
              <p>👆 Select a garage to view its dashboard</p>
            </div>
          )}
        </main>
      </div>
    </QueryClientProvider>
  );
}

export default App;

