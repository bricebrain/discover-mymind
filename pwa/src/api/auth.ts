import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './client';

export interface SessionInfo {
  id: string;
  label: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
}

const SESSION_KEY = ['auth', 'session'] as const;
const SESSIONS_KEY = ['auth', 'sessions'] as const;

export interface AuthState {
  session: SessionInfo | null;
  /** Connexion désactivée côté Worker : l'app s'ouvre sans écran de connexion. */
  authDisabled: boolean;
}

/** État de connexion ; `session: null` si non connecté. */
export function useSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: async (): Promise<AuthState> => {
      try {
        const r = await api<{ session: SessionInfo | null; authDisabled?: boolean }>('/api/auth/session');
        return { session: r.session, authDisabled: r.authDisabled === true };
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return { session: null, authDisabled: false };
        throw e;
      }
    },
    staleTime: 5 * 60_000,
    retry: (count, e) => !(e instanceof ApiError && e.status < 500) && count < 2,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (passphrase: string) => api<{ session: SessionInfo }>('/api/auth/login', { method: 'POST', body: { passphrase } }),
    onSuccess: ({ session }) => qc.setQueryData<AuthState>(SESSION_KEY, { session, authDisabled: false }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/api/auth/logout', { method: 'POST' }),
    onSettled: () => {
      qc.clear();
      qc.setQueryData<AuthState>(SESSION_KEY, { session: null, authDisabled: false });
    },
  });
}

export function useSessions() {
  return useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: async () => (await api<{ sessions: SessionInfo[] }>('/api/auth/sessions')).sessions,
  });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/auth/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: (_d, id) => {
      const current = qc.getQueryData<AuthState>(SESSION_KEY);
      if (current?.session?.id === id) {
        qc.clear();
        qc.setQueryData<AuthState>(SESSION_KEY, { session: null, authDisabled: false });
      } else {
        void qc.invalidateQueries({ queryKey: SESSIONS_KEY });
      }
    },
  });
}

export function useRevokeOthers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ revoked: number }>('/api/auth/sessions/revoke-others', { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
}
