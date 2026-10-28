import '@fontsource-variable/geist';
import '@fontsource-variable/literata';
import '@fontsource/instrument-serif';
import './styles/app.css';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { ApiError } from './api/client';
import { App } from './app/App';
import { clearLibraryCache, startLibraryPersistence } from './cache/libraryPersistence';
import { watchAppUpdates } from './pwa/updates';

const queryClient: QueryClient = new QueryClient({
  // Une session expirée ou révoquée ailleurs renvoie l'utilisateur vers l'écran de connexion.
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        void clearLibraryCache(queryClient);
        queryClient.setQueryData(['auth', 'session'], { session: null, authDisabled: false });
      }
    },
  }),
  defaultOptions: { queries: { refetchOnWindowFocus: true } },
});

registerSW({ immediate: true, onRegisteredSW: (_url, registration) => {
  if (registration) watchAppUpdates(registration);
} });

const root = createRoot(document.getElementById('root')!);
const render = () => root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
void startLibraryPersistence(queryClient).then(render, render);
