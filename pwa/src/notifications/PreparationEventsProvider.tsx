import { createContext,useContext,useEffect,useState,type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notificationApi } from './api';
import { watchPreparations } from './connection';
import { refreshPreparations } from './refreshPreparations';

const EventsContext=createContext(false);
export const usePreparationLive=()=>useContext(EventsContext);

export function PreparationEventsProvider({children}:{children:ReactNode}) {
  const qc=useQueryClient();const [connected,setConnected]=useState(false);
  useEffect(()=>{
    return watchPreparations(
      ()=>qc.fetchQuery({queryKey:['notifications'],queryFn:notificationApi.config}),
      setConnected,
      (change)=>refreshPreparations(qc,change),
      (at)=>{
        for (const [key,data] of qc.getQueriesData<{atelierSeenAt?:string|null}>({queryKey:['queue']})) {
          if (data) qc.setQueryData(key,{...data,atelierSeenAt:at},{updatedAt:qc.getQueryState(key)?.dataUpdatedAt});
        }
      },
    );
  },[qc]);
  return <EventsContext.Provider value={connected}>{children}</EventsContext.Provider>;
}
