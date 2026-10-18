import { expect, it } from 'vitest';
import { PreparationEvents } from '../src/events/hub';

it.each([1000,1004,1005,1006,1015])('ferme une vraie connexion sans renvoyer le code réservé %s', (code) => {
  const pair = new WebSocketPair();
  pair[0].accept(); pair[1].accept();
  expect(() => PreparationEvents.prototype.webSocketClose(pair[1],code,'')).not.toThrow();
  pair[0].close(1000);
});
