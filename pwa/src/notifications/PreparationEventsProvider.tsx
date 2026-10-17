import { createContext,useContext,useEffect,useState,type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notificationApi } from './api';
import { watchPreparations } from './connection';

const EventsContext=createContext(false);
export const usePreparationLive=()=>useContext(EventsContext);

export function PreparationEventsProvider({children}:{children:ReactNode}) {
  const qc=useQueryClient();const [connected,setConnected]=useState(false);
  useEffect(()=>{
    return watchPreparations(
      ()=>qc.fetchQuery({queryKey:['notifications'],queryFn:notificationApi.config}),
      setConnected,
      ()=>{for(const key of ['queue','episode','library','explorer','content']) void qc.invalidateQueries({queryKey:[key]});},
    );
  },[qc]);
  return <EventsContext.Provider value={connected}>{children}</EventsContext.Provider>;
}
