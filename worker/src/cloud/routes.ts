import { authDisabled, type Env } from '../env';
import { HttpError, json, readJson } from '../http';
import * as auth from '../routes/auth';
import { getSession } from '../security/session';
import { snapshot } from './source';
import { assertEnabled, enabled, monthlyLimit, utcMonth } from './store';
import { RUN_MICROS, type Snapshot } from './types';
import { dispatch } from './dispatch';

export async function cloudRoute(req:Request,env:Env,path:string):Promise<Response> {
  if (path==='/api/cloud/auth' && req.method==='POST') return auth.login(req,env);
  const session=await getSession(env,req);
  const authRequired=!authDisabled(env);
  const authorized=!authRequired || !!session;
  if (path==='/api/cloud/status' && req.method==='GET') {
    if (!authorized) return json({owner:false,authRequired,enabled:enabled(env)});
    const month=utcMonth(), used=await env.DB.prepare('SELECT COALESCE(SUM(reserved_micros),0) AS micros FROM cloud_runs WHERE month=?')
      .bind(month).first<{micros:number}>();
    return json({owner:true,authRequired,enabled:enabled(env),youtube:!!env.YOUTUBE_DATA_API_KEY,month,
      reservedMicros:used!.micros,limitMicros:monthlyLimit(env),runMicros:RUN_MICROS});
  }
  if (!authorized) throw new HttpError(401,'unauthenticated','Déverrouille l’Atelier sans Mac avec ta phrase secrète.');
  if (path==='/api/cloud/logout' && req.method==='POST') return session ? auth.logout(env,session) : new Response(null,{status:204});
  if (path==='/api/cloud/quotes' && req.method==='POST') {
    assertEnabled(env);
    const captured=await snapshot(env,await readJson<Record<string,unknown>>(req,4096));
    const id=crypto.randomUUID(), now=new Date().toISOString(), expiresAt=new Date(Date.now()+600_000).toISOString();
    await env.DB.prepare('INSERT INTO cloud_quotes(id,snapshot_json,month,expires_at,created_at) VALUES (?,?,?,?,?)')
      .bind(id,JSON.stringify(captured),utcMonth(),expiresAt,now).run();
    return json({id,title:captured.source.title,reserveMicros:RUN_MICROS,expiresAt,
      attribution:captured.source.attribution,durationSec:captured.source.durationSec},201);
  }
  if (path==='/api/cloud/runs' && req.method==='POST') {
    assertEnabled(env);
    const b=await readJson<{quoteId?:unknown;acceptedMicros?:unknown}>(req,1024);
    if (typeof b?.quoteId!=='string' || !/^[0-9a-f-]{36}$/.test(b.quoteId) || b.acceptedMicros!==RUN_MICROS) {
      throw new HttpError(422,'cloud_consent','Confirme l’enveloppe de cette préparation.');
    }
    const old=await env.DB.prepare('SELECT id FROM cloud_runs WHERE quote_id=?').bind(b.quoteId).first<{id:string}>();
    if (old) { await dispatch(env,old.id); return json({id:old.id},200); }
    const quote=await env.DB.prepare('SELECT snapshot_json,expires_at,month FROM cloud_quotes WHERE id=?').bind(b.quoteId)
      .first<{snapshot_json:string;expires_at:string;month:string}>();
    if (!quote || quote.expires_at<=new Date().toISOString() || quote.month!==utcMonth()) throw new HttpError(409,'quote_expired','Le devis a expiré ; vérifie à nouveau.');
    const captured=JSON.parse(quote.snapshot_json) as Snapshot;
    const id=crypto.randomUUID(), token=crypto.randomUUID(), now=new Date().toISOString();
    try {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO cloud_guards(id,valid) SELECT ?,CASE WHEN
          COALESCE((SELECT SUM(reserved_micros) FROM cloud_runs WHERE month=?),0)+?<=?
          AND EXISTS(SELECT 1 FROM cloud_quotes WHERE id=? AND expires_at>? AND month=?) THEN 1 ELSE 0 END`)
          .bind(id,utcMonth(),RUN_MICROS,monthlyLimit(env),b.quoteId,now,utcMonth()),
        env.DB.prepare(`INSERT INTO prepare_queue(id,kind,ref,options_json,status,executor,lease_token,lease_owner,lease_expires_at,max_attempts,created_at,updated_at)
          VALUES (?,?,?,?,'leased','cloud',?,'cloud',?,1,?,?)`)
          .bind(id,captured.source.kind,captured.source.ref,JSON.stringify(captured.options),token,new Date(Date.now()+3_600_000).toISOString(),now,now),
        env.DB.prepare(`INSERT INTO cloud_runs(id,quote_id,month,snapshot_json,lease_token,reserved_micros,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`)
          .bind(id,b.quoteId,utcMonth(),quote.snapshot_json,token,RUN_MICROS,now,now),
        env.DB.prepare('DELETE FROM cloud_guards WHERE id=?').bind(id),
      ]);
    } catch (e) {
      const same=await env.DB.prepare('SELECT id FROM cloud_runs WHERE quote_id=?').bind(b.quoteId).first<{id:string}>();
      if (same) { await dispatch(env,same.id); return json({id:same.id},200); }
      if (String(e).includes('constraint')) throw new HttpError(409,'cloud_conflict','Budget insuffisant, devis expiré ou préparation déjà en cours.');
      throw e;
    }
    // Une panne de dispatch ne perd pas l'intention : le cron reprend le même identifiant, sans nouvel achat.
    await dispatch(env,id);
    return json({id},201);
  }
  throw new HttpError(404,'not_found','Route cloud inconnue.');
}

/** Les anciennes routes publiques de file ne doivent pas contourner l'autorisation cloud. */
export async function protectCloudQueue(req:Request,env:Env,id:string) {
  if (authDisabled(env)) return;
  if (await env.DB.prepare("SELECT id FROM prepare_queue WHERE id=? AND executor='cloud'").bind(id).first() && !await getSession(env,req)) {
    throw new HttpError(401,'unauthenticated','Connexion propriétaire requise.');
  }
}
