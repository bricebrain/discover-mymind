import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import { validIdentity,type EventIdentity } from './identity';
import { deliverPush } from './push';

interface EventRow {id:number;queue_id:string;status:string;notification:'ready'|'review'|'failed'|null;created_at:string}

/** Un coordinateur pour la bibliothèque personnelle, pas pour les préparations elles-mêmes (D1). */
export class PreparationEvents extends DurableObject<Env> {
  private running:Promise<void>|null=null;
  private requested=false;
  constructor(ctx:DurableObjectState,env:Env) {
    super(ctx,env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'));
  }
  override async fetch(request:Request):Promise<Response> {
    if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket') return new Response(null,{status:426});
    const attachment=JSON.parse(request.headers.get('X-Discover-Identity') ?? 'null') as EventIdentity;
    if(!attachment) return new Response(null,{status:401});
    if(!await validIdentity(this.env,attachment)) return new Response(null,{status:401});
    const sockets=this.ctx.getWebSockets();
    if(sockets.length>=20) return new Response(null,{status:429});
    const pair=new WebSocketPair();const [client,server]=Object.values(pair) as [WebSocket,WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(attachment);
    server.send(JSON.stringify({type:'connected'}));
    return new Response(null,{status:101,webSocket:client});
  }
  override async webSocketMessage(ws:WebSocket,message:string|ArrayBuffer) {
    if(message!=='ping' || !await validIdentity(this.env,ws.deserializeAttachment() as EventIdentity)) ws.close(1008,'Reconnexion requise');
    else ws.send('pong');
  }
  override webSocketClose(ws:WebSocket,code:number,reason:string) {
    // Ces codes décrivent une fermeture sans trame valide et ne peuvent pas être renvoyés.
    const replyCode=[1004,1005,1006,1015].includes(code)?1000:code;
    ws.close(replyCode,reason);
  }
  override webSocketError(ws:WebSocket) {ws.close(1011,'Reconnexion requise');}

  async atelierSeen(at: string) {
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as EventIdentity;
      if (a?.role === 'atelier') continue;
      if (a && await validIdentity(this.env,a)) {
        try { ws.send(JSON.stringify({type:'atelier.seen',at})); } catch { ws.close(1011,'Reconnexion requise'); }
      }
    }
  }

  /** Les demandes de texte et de vocabulaire réveillent le Mac sans lire la file D1. */
  async notifyAtelier() {
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as EventIdentity;
      if (a?.role !== 'atelier') continue;
      if (!await validIdentity(this.env,a)) { ws.close(1008,'Reconnexion requise'); continue; }
      try { ws.send(JSON.stringify({type:'work.changed'})); } catch { ws.close(1011,'Reconnexion requise'); }
    }
  }

  flush():Promise<void> {
    this.requested=true;
    if(!this.running) this.running=(async()=>{do{this.requested=false;await this.drain();}while(this.requested);})().finally(()=>{this.running=null;});
    return this.running;
  }
  override async alarm() {await this.flush();}
  private async drain() {
    // L'alarme précède les I/O : un crash garde une reprise durable. Le cron couvre un appel initial manqué.
    await this.ctx.storage.setAlarm(Date.now()+60_000);
    const valid:WebSocket[]=[],visible=new Set<string>();
    for(const ws of this.ctx.getWebSockets()) {
      const a=ws.deserializeAttachment() as EventIdentity;
      if(a && await validIdentity(this.env,a)) {valid.push(ws);if(a.role!=='atelier') visible.add(a.deviceId);}
      else ws.close(1008,'Session expirée');
    }
    const events=await this.env.DB.prepare('SELECT id,queue_id,status,notification,created_at FROM queue_events WHERE dispatched_at IS NULL ORDER BY id LIMIT 50').all<EventRow>();
    for(const event of events.results) {
      for(const ws of valid) {
        try{ws.send(JSON.stringify({type:'queue.changed',eventId:event.id,status:event.status}));}catch{ws.close(1011,'Reconnexion requise');}
      }
      const statements:D1PreparedStatement[]=[this.env.DB.prepare(`UPDATE push_deliveries SET finished_at=?
        WHERE finished_at IS NULL AND event_id IN (SELECT CAST(id AS TEXT) FROM queue_events WHERE queue_id=? AND id<?)`)
        .bind(Date.now(),event.queue_id,event.id)];
      if(event.notification && Date.parse(event.created_at)>Date.now()-3_600_000) {
        statements.push(this.env.DB.prepare(`INSERT OR IGNORE INTO push_deliveries(event_id,device_id,kind,next_at,expires_at)
          SELECT ?,id,?,?,? FROM push_subscriptions WHERE created_at<=?`)
          .bind(String(event.id),event.notification,Date.now(),Date.now()+3_600_000,event.created_at));
      }
      statements.push(this.env.DB.prepare('UPDATE queue_events SET dispatched_at=? WHERE id=?').bind(new Date().toISOString(),event.id));
      await this.env.DB.batch(statements);
    }
    await deliverPush(this.env,visible);
    const pending=await this.env.DB.prepare(`SELECT 1 AS pending FROM queue_events WHERE dispatched_at IS NULL UNION ALL
      SELECT 1 FROM push_deliveries WHERE finished_at IS NULL LIMIT 1`).first();
    if(!pending) await this.ctx.storage.deleteAlarm();
  }
}

export async function flushEvents(env:Env) {
  try{await env.EVENTS.getByName('personal-library').flush();}
  catch{console.warn(JSON.stringify({event:'events_delivery_deferred'}));}
}
export async function cleanupEvents(env:Env) {
  const cutoff=Date.now()-7*86_400_000;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM queue_events WHERE dispatched_at<?').bind(new Date(cutoff).toISOString()),
    env.DB.prepare('DELETE FROM push_deliveries WHERE finished_at<? OR expires_at<?').bind(cutoff,cutoff),
  ]);
}
