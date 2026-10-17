import { api } from '../api/client';
export interface NotificationConfig {publicKey:string|null;configured:boolean;enabled:boolean}
export const notificationApi={
  config:()=>api<NotificationConfig>('/api/notifications/config'),
  subscribe:(subscription:PushSubscriptionJSON)=>api<void>('/api/notifications/subscription',{method:'PUT',body:subscription}),
  unsubscribe:()=>api<void>('/api/notifications/subscription',{method:'DELETE'}),
  test:()=>api<void>('/api/notifications/test',{method:'POST',body:{}}),
};
