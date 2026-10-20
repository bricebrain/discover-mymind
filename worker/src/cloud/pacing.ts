import { concat } from './mp3';

export const SPEECH_SPEED = 0.9;
export const INTRO_PAUSE_MS = 650;
export const PARAGRAPH_PAUSE_MS = 900;

// Trame silencieuse autonome : LAME, MPEG-2 Layer III, mono 22,05 kHz,
// 48 kbps, réservoir désactivé. Chaque trame contient 576 échantillons.
const SILENT_FRAME = '//NixAAAAANIAAAAAExBTUUzLjk5LjUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
export function silence(durationMs:number) {
  const frame=Uint8Array.from(atob(SILENT_FRAME),c=>c.charCodeAt(0));
  const count=Math.round(durationMs*22.05/576);
  return {bytes:concat(Array.from({length:count},()=>frame)),samples:count*576};
}
