// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatRemaining, PreparationProgress } from './PreparationProgress';
import type { QueueItem } from './types';

describe('avancement d’une préparation', () => {
  it('formule le temps restant simplement', () => {
    expect(formatRemaining(20)).toBe('moins d’une minute');
    expect(formatRemaining(300)).toBe('environ 5 min');
    expect(formatRemaining(3900)).toBe('environ 1 h 05');
  });
  it('affiche l’étape, le pourcentage et la frise', () => {
    const item = { id: '1', kind: 'episode', ref: 'x', title: 'T', status: 'leased', stage: 'tts', attempts: 1, maxAttempts: 3, error: null,
      contentId: null, leaseExpiresAt: null, createdAt: '', updatedAt: '', executor: 'mac',
      options: { coverage: 'condensed', level: 'B1', style: 'narration', targetMinutes: 12, faithful: false, keepOriginalCopy: false },
      progress: { stages: ['download', 'adapt', 'tts', 'publish'], current: 2, percent: 72, remainingSec: 240, startedAt: null, stageStartedAt: null, history: true },
    } as QueueItem;
    render(<PreparationProgress item={item} fetchedAt={Date.now()} />);
    expect(screen.getByText('72%')).toBeTruthy();
    expect(screen.getByText(/Étape 3\/4/)).toBeTruthy();
    expect(screen.getByText(/environ 4 min/)).toBeTruthy();
  });
});
