import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { ApiError } from './api/client';
import { App } from './app/App';

const queryClient: QueryClient = new QueryClient({
  // Une session expirée ou révoquée ailleurs renvoie l'utilisateur vers l'écran de connexion.
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) queryClient.setQueryData(['auth', 'session'], null);
    },
  }),
  defaultOptions: { queries: { refetchOnWindowFocus: true } },
});

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
