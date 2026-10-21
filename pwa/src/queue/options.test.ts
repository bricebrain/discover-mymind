import { describe,expect,it } from 'vitest';
import { defaultOptions,optionsLabel,queueLabel } from './options';
import type { QueueItem } from './types';

describe('préparation',() => {
  it('propose l’original guidé par défaut, au niveau B1',() => {
    expect(defaultOptions()).toEqual({coverage:'guided',level:'B1',style:'narration',targetMinutes:null,faithful:false,keepOriginalCopy:false});
    expect(optionsLabel(defaultOptions())).toBe('Original guidé · explications B1');
    expect(optionsLabel({...defaultOptions(),coverage:'condensed',targetMinutes:12})).toBe('Condensé · B1 · 12 min');
  });
  it('ne présente pas une source transcrite comme une préparation achevée',() => {
    expect(queueLabel({status:'pending',stage:'source_ready'} as QueueItem)).toContain('en attente de l’adaptation');
    expect(queueLabel({status:'done'} as QueueItem)).toBe('Prêt');
  });
});
