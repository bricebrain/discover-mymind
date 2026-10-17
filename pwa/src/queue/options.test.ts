import { describe,expect,it } from 'vitest';
import { defaultOptions,optionsLabel,queueLabel } from './options';
import type { QueueItem } from './types';

describe('préparation',() => {
  it('propose un intégral jusqu’à 25 minutes, un condensé au-delà et l’essentiel pour les journaux',() => {
    expect(defaultOptions(1500,'show')).toMatchObject({coverage:'full',targetMinutes:null});
    expect(defaultOptions(1501,'show')).toMatchObject({coverage:'condensed',targetMinutes:12});
    expect(defaultOptions(600,'bloomberg-daybreak-europe')).toMatchObject({coverage:'essentials',targetMinutes:4});
    expect(optionsLabel(defaultOptions(3000,'show'))).toBe('Condensé · B1 · 12 min');
  });
  it('ne présente pas une source transcrite comme une préparation achevée',() => {
    expect(queueLabel({status:'pending',stage:'source_ready'} as QueueItem)).toContain('en attente de l’adaptation');
    expect(queueLabel({status:'done'} as QueueItem)).toBe('Prêt');
  });
});
