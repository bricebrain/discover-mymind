import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { downloadMarkdown, fetchWeekly, fetchWeeklyMarkdown } from './api';
import { selectedWeek, shiftWeek, weekKey, weekMonday } from './helpers';

export function useWeekly() {
  const [params, setParams] = useSearchParams();
  const [now, setNow] = useState(() => new Date());
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const refresh = () => { setOnline(navigator.onLine); setNow(new Date()); };
    const timer = setInterval(refresh, 60_000);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
    };
  }, []);
  const currentWeek = weekKey(now);
  const week = selectedWeek(params.get('week'), currentWeek);
  const query = useQuery({ queryKey: ['weekly', week], queryFn: () => fetchWeekly(week), enabled: online, retry: false });
  const exportWeek = useMutation({
    mutationFn: async (key: string) => downloadMarkdown(await fetchWeeklyMarkdown(key), key),
    retry: false,
  });
  useEffect(() => { exportWeek.reset(); }, [week]); // Retirer le retour d’export de la semaine quittée.
  const move = (offset: number) => {
    const next = shiftWeek(week, offset);
    if (!weekMonday(next) || next > currentWeek) return;
    const search = new URLSearchParams(params);
    search.set('week', next);
    setParams(search);
  };
  return {
    week, currentWeek, online, query, exportWeek, move,
    canPrevious: Boolean(weekMonday(shiftWeek(week, -1))),
    canNext: week < currentWeek,
  };
}
