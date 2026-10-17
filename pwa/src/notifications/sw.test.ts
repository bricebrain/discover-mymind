import { beforeEach,afterEach,expect,it,vi } from 'vitest';
vi.mock('workbox-core',()=>({clientsClaim:vi.fn()}));
vi.mock('workbox-precaching',()=>({cleanupOutdatedCaches:vi.fn(),createHandlerBoundToURL:vi.fn(),precacheAndRoute:vi.fn()}));
vi.mock('workbox-routing',()=>({NavigationRoute:class{},registerRoute:vi.fn()}));
let handlers:Map<string,(event:object)=>void>;
let show:ReturnType<typeof vi.fn>,navigate:ReturnType<typeof vi.fn>,focus:ReturnType<typeof vi.fn>;
beforeEach(async()=>{
 vi.resetModules();handlers=new Map();show=vi.fn(async()=>{});navigate=vi.fn(async()=>{});focus=vi.fn(async()=>{});
 vi.stubGlobal('self',{__WB_MANIFEST:[],skipWaiting:vi.fn(),location:{origin:'https://discover.test'},
   registration:{showNotification:show},clients:{matchAll:async()=>[{url:'https://discover.test/',navigate,focus}],openWindow:vi.fn()},
   addEventListener:(name:string,handler:(event:object)=>void)=>handlers.set(name,handler)});
 await import('../sw');
});
afterEach(()=>vi.unstubAllGlobals());
it('affiche une notification visible et conserve une destination locale autorisée',async()=>{
 let work!:Promise<unknown>;
 handlers.get('push')!({data:{json:()=>({body:'Une préparation est prête.',tag:'discover-7',url:'https://evil.test'})},waitUntil:(p:Promise<unknown>)=>{work=p;}});
 await work;expect(show).toHaveBeenCalledWith('Discover',expect.objectContaining({body:'Une préparation est prête.',data:{url:'/library'},tag:'discover-7'}));
});
it('un payload malformé produit un message générique',async()=>{
 let work!:Promise<unknown>;
 handlers.get('push')!({data:{json:()=>{throw new Error('JSON');}},waitUntil:(p:Promise<unknown>)=>{work=p;}});
 await work;expect(show).toHaveBeenCalledWith('Discover',expect.objectContaining({body:'Une préparation a été mise à jour.'}));
});
it('le clic réutilise la fenêtre de Discover sans ouvrir une URL externe',async()=>{
 let work!:Promise<unknown>;const close=vi.fn();
 handlers.get('notificationclick')!({notification:{close,data:{url:'https://evil.test'}},waitUntil:(p:Promise<unknown>)=>{work=p;}});
 await work;expect(close).toHaveBeenCalled();expect(navigate).toHaveBeenCalledWith('https://discover.test/library');expect(focus).toHaveBeenCalled();
});
