import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PICKS_KEY, deleteWordPick, getWordPicks, saveWordPick } from './api';
export function useWordPicks() {
  return useInfiniteQuery({ queryKey: PICKS_KEY, initialPageParam: 0, queryFn: ({ pageParam }) => getWordPicks(pageParam),
    getNextPageParam: (last) => last.nextAfter ?? undefined });
}
export function useWordPickMutations() {
  const qc = useQueryClient();
  const refresh = () => { void qc.invalidateQueries({ queryKey: PICKS_KEY }); };
  return { save: useMutation({ mutationFn: saveWordPick, onSuccess: refresh, retry: false }),
    remove: useMutation({ mutationFn: deleteWordPick, onSuccess: refresh, retry: false }) };
}
