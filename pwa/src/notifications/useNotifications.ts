import { useEffect,useState } from 'react';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { notificationApi } from './api';

export function applicationKey(value:string):Uint8Array<ArrayBuffer> {
  const decoded=atob(value.replace(/-/g,'+').replace(/_/g,'/'));
  return Uint8Array.from(decoded,c=>c.charCodeAt(0));
}
export function useNotifications() {
  const supported=typeof Notification!=='undefined' && 'serviceWorker' in navigator && 'PushManager' in window && window.isSecureContext;
  const qc=useQueryClient();const config=useQuery({queryKey:['notifications'],queryFn:notificationApi.config});
  const [permission,setPermission]=useState<NotificationPermission>(supported?Notification.permission:'default');
  const [subscribed,setSubscribed]=useState(false);
  const inspect=async()=>{
    if(!supported) return;
    setPermission(Notification.permission);
    const registration=await navigator.serviceWorker.getRegistration();
    setSubscribed(!!await registration?.pushManager.getSubscription());
  };
  useEffect(()=>{void inspect().catch(()=>setSubscribed(false));const onFocus=()=>void inspect().catch(()=>setSubscribed(false));window.addEventListener('focus',onFocus);return ()=>window.removeEventListener('focus',onFocus);},[supported]);
  const enable=useMutation({mutationFn:async()=>{
    // Demande uniquement après le clic explicite, avant toute I/O qui ferait perdre le geste utilisateur.
    const granted=await Notification.requestPermission();setPermission(granted);
    if(granted!=='granted') throw new Error('Les notifications ne sont pas autorisées sur cet appareil.');
    const publicKey=config.data?.publicKey;
    if(!publicKey) throw new Error('Les notifications ne sont pas encore disponibles.');
    const registration=await navigator.serviceWorker.ready;
    let subscription=await registration.pushManager.getSubscription();
    const wanted=applicationKey(publicKey);
    if(subscription && subscription.options.applicationServerKey &&
        new Uint8Array(subscription.options.applicationServerKey).some((byte,index)=>byte!==wanted[index])) {
      await subscription.unsubscribe();subscription=null;
    }
    const created=!subscription;
    subscription ??= await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:wanted});
    try{await notificationApi.subscribe(subscription.toJSON());}
    catch(error){if(created) await subscription.unsubscribe();throw error;}
  },onSuccess:async()=>{await inspect();await qc.invalidateQueries({queryKey:['notifications']});}});
  const disable=useMutation({mutationFn:async()=>{
    await notificationApi.unsubscribe();
    const registration=await navigator.serviceWorker.getRegistration();
    await (await registration?.pushManager.getSubscription())?.unsubscribe();
  },onSuccess:async()=>{await inspect();await qc.invalidateQueries({queryKey:['notifications']});}});
  const test=useMutation({mutationFn:notificationApi.test});
  const active=permission==='granted' && subscribed && !!config.data?.enabled;
  return {supported,permission,config,active,enable,disable,test,error:enable.error ?? disable.error ?? test.error};
}
