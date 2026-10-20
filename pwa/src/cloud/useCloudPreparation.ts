import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PrepTarget } from '../api/queue';
import type { PrepareOptions } from '../queue/types';
import { cloudApi, cloudOptions, type CloudQuote } from './api';
import { ApiError } from '../api/client';

export function useCloudPreparation(target:PrepTarget,onQueued:()=>void) {
  const qc=useQueryClient(),[quote,setQuote]=useState<CloudQuote|null>(null);
  const [level,setLevelState]=useState<PrepareOptions['level']>('B1');
  const status=useQuery({queryKey:['cloud-status'],queryFn:cloudApi.status,retry:false});
  const unlock=useMutation({mutationFn:cloudApi.unlock,retry:false,onSuccess:()=>qc.invalidateQueries({queryKey:['cloud-status']})});
  const lock=useMutation({mutationFn:cloudApi.lock,retry:false,onSuccess:()=>{setQuote(null);return qc.invalidateQueries({queryKey:['cloud-status']});}});
  const onError=(error:Error)=>{if(error instanceof ApiError && error.status===401) void qc.invalidateQueries({queryKey:['cloud-status']});};
  const estimate=useMutation({mutationFn:()=>cloudApi.quote(target,cloudOptions(level)),retry:false,onSuccess:setQuote,onError});
  const start=useMutation({mutationFn:()=>cloudApi.start(quote!),retry:false,onError,onSuccess:()=>{
    void qc.invalidateQueries({queryKey:['queue']});
    void qc.invalidateQueries({queryKey:['cloud-status']});
    onQueued();
  }});
  const setLevel=(value:PrepareOptions['level'])=>{setLevelState(value);setQuote(null);estimate.reset();start.reset();};
  return {status,unlock,lock,estimate,start,quote,level,setLevel};
}
