import { api } from '../api/client';
import type { PrepTarget } from '../api/queue';
import type { PrepareOptions } from '../queue/types';

export interface CloudStatus { owner:boolean; enabled:boolean; youtube?:boolean; month?:string; reservedMicros?:number; limitMicros?:number; runMicros?:number }
export interface CloudQuote { id:string;title:string;reserveMicros:number;expiresAt:string;attribution:string|null;durationSec:number|null }
export const cloudApi={
  status:()=>api<CloudStatus>('/api/cloud/status'),
  unlock:(passphrase:string)=>api('/api/cloud/auth',{method:'POST',body:{passphrase}}),
  lock:()=>api<void>('/api/cloud/logout',{method:'POST'}),
  quote:(target:PrepTarget,options:PrepareOptions)=>api<CloudQuote>('/api/cloud/quotes',{method:'POST',body:{target,options}}),
  start:(quote:CloudQuote)=>api<{id:string}>('/api/cloud/runs',{method:'POST',body:{quoteId:quote.id,acceptedMicros:quote.reserveMicros}}),
};
export const cloudOptions=(level:PrepareOptions['level']):PrepareOptions=>({level,coverage:'essentials',style:'narration',targetMinutes:4,faithful:false,keepOriginalCopy:false});
export const dollars=(micros:number)=>`${new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(micros/1_000_000)} $US`;
