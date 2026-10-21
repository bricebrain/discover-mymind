import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { watchPreparations } from './connection';

class FakeSocket {
  static OPEN=1;static sockets:FakeSocket[]=[];
  readyState=1;onopen:(()=>void)|null=null;onmessage:((event:{data:string})=>void)|null=null;
  onclose:(()=>void)|null=null;onerror:(()=>void)|null=null;
  send=vi.fn();close=vi.fn(()=>{this.readyState=3;});
  constructor(readonly url:URL){FakeSocket.sockets.push(this);}
  message(data:string){this.onmessage?.({data});}
}
let doc:EventTarget & {visibilityState:string},win:EventTarget;
let stop:()=>void;
beforeEach(()=>{
  vi.useFakeTimers();FakeSocket.sockets=[];
  doc=Object.assign(new EventTarget(),{visibilityState:'visible'});win=new EventTarget();
  vi.stubGlobal('document',doc);vi.stubGlobal('window',win);vi.stubGlobal('navigator',{onLine:true});
  vi.stubGlobal('location',{href:'https://discover.test/',protocol:'https:'});vi.stubGlobal('WebSocket',FakeSocket);
});
afterEach(()=>{stop?.();vi.useRealTimers();vi.unstubAllGlobals();});
it('réactualise à la connexion et regroupe une rafale d’événements',async()=>{
  const changed=vi.fn(),live=vi.fn();stop=watchPreparations(async()=>{},live,changed);
  await vi.advanceTimersByTimeAsync(0);const ws=FakeSocket.sockets[0]!;
  expect(ws.url.href).toBe('wss://discover.test/api/events');ws.onopen?.();
  ws.message('{"type":"connected"}');ws.message('{"type":"queue.changed","eventId":1}');ws.message('{"type":"queue.changed","eventId":2}');
  expect(live).toHaveBeenLastCalledWith(true);await vi.advanceTimersByTimeAsync(100);expect(changed).toHaveBeenCalledTimes(1);
});
it('reconnecte après coupure et ignore les événements tardifs d’une ancienne socket',async()=>{
  const live=vi.fn();stop=watchPreparations(async()=>{},live,()=>{});await vi.advanceTimersByTimeAsync(0);
  const old=FakeSocket.sockets[0]!;old.onclose?.();await vi.advanceTimersByTimeAsync(1600);
  const current=FakeSocket.sockets[1]!;current.onopen?.();current.message('{"type":"connected"}');
  old.onclose?.();expect(live).toHaveBeenLastCalledWith(true);
  await vi.advanceTimersByTimeAsync(30_000);expect(current.send).toHaveBeenCalledWith('ping');
});
it('ferme pendant la mise en arrière-plan puis récupère l’état au retour',async()=>{
  const changed=vi.fn();stop=watchPreparations(async()=>{},()=>{},changed);await vi.advanceTimersByTimeAsync(0);
  const ws=FakeSocket.sockets[0]!;doc.visibilityState='hidden';doc.dispatchEvent(new Event('visibilitychange'));
  expect(ws.close).toHaveBeenCalled();await vi.advanceTimersByTimeAsync(30_000);expect(FakeSocket.sockets).toHaveLength(1);
  doc.visibilityState='visible';doc.dispatchEvent(new Event('visibilitychange'));await vi.advanceTimersByTimeAsync(100);
  expect(FakeSocket.sockets).toHaveLength(2);expect(changed).toHaveBeenCalled();
});
it('une connexion muette est fermée et le démontage annule toute reconnexion',async()=>{
  stop=watchPreparations(async()=>{},()=>{},()=>{});await vi.advanceTimersByTimeAsync(0);
  const ws=FakeSocket.sockets[0]!;ws.onopen?.();await vi.advanceTimersByTimeAsync(60_000);expect(ws.close).toHaveBeenCalled();
  stop();await vi.advanceTimersByTimeAsync(60_000);expect(FakeSocket.sockets).toHaveLength(1);
});
it('un démontage pendant la configuration ne crée pas de connexion tardive',async()=>{
  let resolve!:()=>void;const configured=new Promise<void>(r=>{resolve=r;});
  stop=watchPreparations(()=>configured,()=>{},()=>{});stop();resolve();await vi.advanceTimersByTimeAsync(0);
  expect(FakeSocket.sockets).toHaveLength(0);
});
it('un signal de présence met à jour l’Atelier sans relire la file',async()=>{
  const changed=vi.fn(),seen=vi.fn();
  stop=watchPreparations(async()=>{},()=>{},changed,seen);
  await vi.advanceTimersByTimeAsync(0);
  const ws=FakeSocket.sockets[0]!;
  ws.message('{"type":"atelier.seen","at":"2026-10-20T20:00:00.000Z"}');
  ws.message('{"type":"atelier.seen","at":"invalid"}');
  await vi.advanceTimersByTimeAsync(100);
  expect(seen).toHaveBeenCalledExactlyOnceWith('2026-10-20T20:00:00.000Z');
  expect(changed).not.toHaveBeenCalled();
});
it('distingue une étape intermédiaire d’une publication et conserve la fin dans une rafale',async()=>{
  const changed=vi.fn();stop=watchPreparations(async()=>{},()=>{},changed);
  await vi.advanceTimersByTimeAsync(0);const ws=FakeSocket.sockets[0]!;
  ws.message('{"type":"queue.changed","status":"leased"}');
  await vi.advanceTimersByTimeAsync(100);
  expect(changed).toHaveBeenLastCalledWith({reason:'changed',libraryChanged:false});
  ws.message('{"type":"queue.changed","status":"done"}');
  ws.message('{"type":"queue.changed","status":"pending"}');
  await vi.advanceTimersByTimeAsync(100);
  expect(changed).toHaveBeenLastCalledWith({reason:'changed',libraryChanged:true});
});
