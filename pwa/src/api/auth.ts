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

/** Session courante ; `null` si non connecté. */
export function useSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: async () => {
      try {
        return (await api<{ session: SessionInfo }>('/api/auth/session')).session;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
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
    onSuccess: ({ session }) => qc.setQueryData(SESSION_KEY, session),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/api/auth/logout', { method: 'POST' }),
    onSettled: () => {
      qc.clear();
      qc.setQueryData(SESSION_KEY, null);
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
      const current = qc.getQueryData<SessionInfo | null>(SESSION_KEY);
      if (current?.id === id) {
        qc.clear();
        qc.setQueryData(SESSION_KEY, null);
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
