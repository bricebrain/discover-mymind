import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import { ATELIER_TOKEN, call } from './helpers';
import { atelierIdentity, validIdentity } from '../src/events/identity';

const headers = { Authorization: `Bearer ${ATELIER_TOKEN}`, Upgrade: 'websocket' };

it('le canal Atelier exige son Bearer même si une identité est forgée par le client', async () => {
  const forged = JSON.stringify(await atelierIdentity(env));
  expect((await call('/atelier/events', { headers: { Upgrade: 'websocket', 'X-Discover-Identity': forged } })).status).toBe(401);
  expect((await call('/atelier/events', { headers: { Authorization: `Bearer ${ATELIER_TOKEN}` } })).status).toBe(426);
});

it('le canal Atelier reçoit les transitions et les réveils sans transmettre le jeton ni le contenu', async () => {
  const response = await call('/atelier/events', { headers });
  expect(response.status).toBe(101);
  const ws = response.webSocket!;
  ws.accept();
  const messages: string[] = [];
  ws.addEventListener('message', event => { messages.push(String(event.data)); });
  try {
    await env.DB.prepare("INSERT INTO queue_events(queue_id,status) VALUES('atelier-live','pending')").run();
    await env.EVENTS.getByName('personal-library').flush();
    await env.EVENTS.getByName('personal-library').notifyAtelier();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(messages.some(raw => JSON.parse(raw).type === 'queue.changed' && JSON.parse(raw).status === 'pending')).toBe(true);
    expect(messages.some(raw => JSON.parse(raw).type === 'work.changed')).toBe(true);
    expect(messages.join('')).not.toContain(ATELIER_TOKEN);
    expect(messages.join('')).not.toContain('atelier-live');
  } finally { ws.close(); }
});

it('une rotation de jeton ou une identité expirée invalide la connexion Atelier', async () => {
  const identity = await atelierIdentity(env);
  expect(await validIdentity(env, identity)).toBe(true);
  expect(await validIdentity({ ...env, ATELIER_TOKEN: 'another-token-with-at-least-32-characters' }, identity)).toBe(false);
  expect(await validIdentity(env, { ...identity, expires: Date.now() - 1 })).toBe(false);
});
