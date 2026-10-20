/** Assemble uniquement le format CBR MPEG-2 Layer III / 22,05 kHz / 48 kbps demandé à Deepgram.
 * Les bornes viennent du nombre de trames de chaque fragment, jamais d'un débit de parole supposé.
 */
export function mp3Frames(input:Uint8Array):{bytes:Uint8Array;samples:number} {
  let offset=0;
  if (input[0]===73 && input[1]===68 && input[2]===51) {
    if (input.length<10 || input.slice(6,10).some(b=>b>127)) throw new Error('En-tête ID3 invalide.');
    offset=10+((input[6]!<<21)|(input[7]!<<14)|(input[8]!<<7)|input[9]!)+((input[5]!&16) ? 10 : 0);
  }
  const frames:Uint8Array[]=[]; let samples=0;
  while (offset<input.length) {
    if (input.length-offset===128 && String.fromCharCode(...input.slice(offset,offset+3))==='TAG') break;
    const a=input[offset],b=input[offset+1],c=input[offset+2],d=input[offset+3];
    if (a!==255 || b===undefined || (b&254)!==242 || c===undefined || ((c>>2)&3)!==0 || d===undefined) {
      throw new Error('MP3 incompatible : MPEG-2 Layer III 22,05 kHz, 48 kbps requis.');
    }
    const bitrate=[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0][c>>4]!;
    if (!bitrate) throw new Error('Débit MP3 invalide.');
    const length=Math.floor(72_000*bitrate/22_050)+((c>>1)&1);
    if (offset+length>input.length) throw new Error('Trame MP3 tronquée.');
    const frame=input.slice(offset,offset+length), crc=(b&1)===0 ? 2 : 0;
    const tagOffset=4+crc+((d>>6)===3 ? 9 : 17);
    const tag=String.fromCharCode(...frame.slice(tagOffset,tagOffset+4));
    // Retirer les métadonnées de durée de chaque fichier avant concaténation.
    // Le premier bloc Info peut employer un débit supérieur pour loger ses métadonnées.
    if (tag!=='Info' && tag!=='Xing') {
      if (bitrate!==48) throw new Error('Débit MP3 audio incompatible.');
      frames.push(frame); samples+=576;
    }
    offset+=length;
  }
  if (!samples || samples/22.05>90_000) throw new Error('Fragment audio vide ou trop long.');
  return {bytes:concat(frames),samples};
}
export function concat(chunks:Uint8Array[]):Uint8Array {
  const bytes=new Uint8Array(chunks.reduce((n,b)=>n+b.byteLength,0)); let offset=0;
  for (const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return bytes;
}
