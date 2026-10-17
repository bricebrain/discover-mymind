import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queueApi } from '../api/queue';
import type { PrepareOptions } from './types';

export function usePreparation(episodeId?: string) {
  const qc = useQueryClient();
  const query = useQuery({queryKey:['queue',episodeId ?? 'all'],queryFn:() => queueApi.list(episodeId),refetchInterval:15_000});
  const refresh = () => {
    void qc.invalidateQueries({queryKey:['queue']});
    void qc.invalidateQueries({queryKey:['episode']});
    void qc.invalidateQueries({queryKey:['library']});
    void qc.invalidateQueries({queryKey:['explorer']});
  };
  const prepare = useMutation({mutationFn:(options: PrepareOptions) => queueApi.prepare(episodeId!,options),onSuccess:refresh});
  const cancel = useMutation({mutationFn:queueApi.cancel,onSuccess:refresh});
  const retry = useMutation({mutationFn:queueApi.retry,onSuccess:refresh});
  return {query,prepare,cancel,retry};
}
