/** Aucun corps fournisseur ni secret dans les erreurs remontées au client ou aux logs. */
export async function boundedBytes(response: Response, limit: number): Promise<Uint8Array> {
  if (!response.ok || !response.body) throw new Error('Le fournisseur a refusé la demande. Aucun nouvel envoi automatique.');
  const reader=response.body.getReader(), chunks:Uint8Array[]=[];
  let size=0;
  try {
    for (;;) {
      const {done,value}=await reader.read();
      if (done) break;
      size+=value.byteLength;
      if (size>limit) throw new Error('Réponse fournisseur trop volumineuse.');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes=new Uint8Array(size); let offset=0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.byteLength; }
  return bytes;
}
export async function boundedJson(response: Response, limit=500_000): Promise<unknown> {
  const bytes=await boundedBytes(response,limit);
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error('Réponse fournisseur illisible.'); }
}
