import type { Env } from '../env';
import { boundedBytes } from './transport';
import { VOICE } from './types';
import { assertNoTechnicalIds } from './citations';

export async function speak(env:Env,text:string) {
  if (!text.trim() || text.length>1500) throw new Error('Fragment vocal hors limites.');
  assertNoTechnicalIds(text);
  const response=await fetch(`https://api.deepgram.com/v1/speak?model=${VOICE}&encoding=mp3&bit_rate=48000`,{
    method:'POST',headers:{Authorization:`Token ${env.DEEPGRAM_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({text}),redirect:'error',signal:AbortSignal.timeout(90_000),
  });
  return boundedBytes(response,2_000_000);
}
