import { describe,expect,it } from 'vitest';
import { COVERAGES,EXPLANATION_LEVEL_OPTIONS,defaultOptions,optionsLabel,queueLabel } from './options';
import type { QueueItem } from './types';

describe('préparation',() => {
  it('propose l’original guidé par défaut, au niveau A2',() => {
    expect(defaultOptions()).toEqual({coverage:'guided',level:'A2',style:'narration',targetMinutes:null,faithful:false,keepOriginalCopy:false});
    expect(optionsLabel(defaultOptions())).toBe('Original guidé · explications A2');
    expect(optionsLabel({...defaultOptions(),coverage:'condensed',targetMinutes:12})).toBe('Condensé · A2 · 12 min');
  });
  it('limite les nouvelles formules sans perdre les libellés historiques',() => {
    expect(COVERAGES).toEqual({guided:'Original guidé',essentials:'L’essentiel · 4 min (Découvrir)'});
    expect(optionsLabel({...defaultOptions(),coverage:'full'})).toBe('Intégral · A2');
    expect(EXPLANATION_LEVEL_OPTIONS.map(([value]) => value)).toEqual(['A2','B1','B2','C1']);
  });
  it('ne présente pas une source transcrite comme une préparation achevée',() => {
    expect(queueLabel({status:'pending',stage:'source_ready'} as QueueItem)).toContain('en attente de l’adaptation');
    expect(queueLabel({status:'done'} as QueueItem)).toBe('Prêt');
  });
});
