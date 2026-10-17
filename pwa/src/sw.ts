/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches,createHandlerBoundToURL,precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute,registerRoute } from 'workbox-routing';
declare const self:ServiceWorkerGlobalScope;

self.skipWaiting();clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'),{denylist:[/^\/api\//,/^\/atelier\//]}));

self.addEventListener('push',event=>{
  let message:{title?:unknown;body?:unknown;tag?:unknown;url?:unknown}={};
  try{message=event.data?.json() ?? {};}catch{ /* Un message malformé n'exécute aucun contenu distant. */ }
  const url=message.url==='/settings'?'/settings':'/library';
  event.waitUntil(self.registration.showNotification('Discover',{
    body:typeof message.body==='string'?message.body.slice(0,300):'Une préparation a été mise à jour.',
    tag:typeof message.tag==='string'?message.tag.slice(0,100):'discover-preparation',
    icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',data:{url},
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const path=event.notification.data?.url==='/settings'?'/settings':'/library';
  const url=new URL(path,self.location.origin).href;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing=windows.find(w=>new URL(w.url).origin===self.location.origin);
    if(existing){await existing.navigate(url);await existing.focus();}
    else await self.clients.openWindow(url);
  })());
});
