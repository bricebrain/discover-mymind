import { USER_AGENT } from '../collector';
import type { Env } from '../env';
import { apiError, HttpError, json } from '../http';
import { safeFetch } from '../security/safeUrl';

/**
 * Transcriptions fournies par les flux (SRT/VTT, § 7.2). Le Worker récupère le fichier à la
 * première demande et le garde tel quel dans R2 ; la PWA l'analyse elle-même : aucun calcul
 * coûteux côté Worker (10 ms de CPU sur l'offre gratuite).
 */
const MAX_BYTES = 2_000_000;

interface Row {
  transcript_url: string | null;
  transcript_type: 'srt' | 'vtt' | null;
  transcript_r2_key: string | null;
  audio_url: string;
}

export async function getTranscript(env: Env, id: string, fetcher: typeof fetch = fetch): Promise<Response> {
  const ep = await env.DB.prepare('SELECT transcript_url, transcript_type, transcript_r2_key, audio_url FROM episodes WHERE id = ?')
    .bind(id).first<Row>();
  if (!ep) return apiError(404, 'not_found', 'Épisode inconnu.');
  if (!ep.transcript_url || !ep.transcript_type) return apiError(404, 'no_transcript', 'Pas de transcription fournie pour cet épisode.');

  // Clé R2 construite par le Worker uniquement (§ 8.5).
  const key = `transcripts/${id}.${ep.transcript_type}`;
  const cached = await env.FILES.get(key);
  if (cached) return json({ type: ep.transcript_type, audioRef: ep.audio_url, text: await cached.text() });

  const res = await safeFetch(ep.transcript_url, { allowHttp: true, headers: { 'User-Agent': USER_AGENT } }, fetcher);
  if (!res.ok || !res.body) {
    await res.body?.cancel();
    throw new HttpError(502, 'transcript_unavailable', `Transcription indisponible (HTTP ${res.status}).`);
  }
  const declared = Number(res.headers.get('Content-Length') ?? '0');
  if (declared > MAX_BYTES) {
    await res.body.cancel();
    throw new HttpError(502, 'transcript_too_large', 'Transcription trop volumineuse.');
  }
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new HttpError(502, 'transcript_too_large', 'Transcription trop volumineuse.');
  if (!text.includes('-->')) throw new HttpError(502, 'transcript_invalid', 'Le fichier de transcription n’est pas un SRT ou un VTT.');

  await env.FILES.put(key, text, { httpMetadata: { contentType: 'text/plain; charset=utf-8' } });
  await env.DB.prepare('UPDATE episodes SET transcript_r2_key = ? WHERE id = ?').bind(key, id).run();
  return json({ type: ep.transcript_type, audioRef: ep.audio_url, text });
}
