import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePreparationLive } from '../notifications/PreparationEventsProvider';
import { queueApi, type PrepTarget } from '../api/queue';
import type { PrepareOptions } from './types';

export function usePreparation(target?: PrepTarget) {
  const qc = useQueryClient();
  const live = usePreparationLive();
  // Une préparation en cours : rafraîchie toutes les 20 s pour suivre l'étape et affiner le temps restant.
  const query = useQuery({queryKey:['queue',target ? `${target.kind}:${target.id}` : 'all'],queryFn:() => queueApi.list(target),
    refetchInterval:(q) => (q.state.data?.items.some((i) => i.status==='leased') ? 20_000 : live ? false : 15_000)});
  const refresh = () => {
    void qc.invalidateQueries({queryKey:['queue']});
    void qc.invalidateQueries({queryKey:['episode']});
    void qc.invalidateQueries({queryKey:['library']});
    void qc.invalidateQueries({queryKey:['explorer']});
  };
  const prepare = useMutation({mutationFn:(options: PrepareOptions) => queueApi.prepare(target!,options),onSuccess:refresh});
  const cancel = useMutation({mutationFn:queueApi.cancel,onSuccess:refresh});
  const retry = useMutation({mutationFn:queueApi.retry,onSuccess:refresh});
  const remove = useMutation({mutationFn:queueApi.remove,onSuccess:refresh});
  return {query,prepare,cancel,retry,remove};
}
