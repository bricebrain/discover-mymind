const GROUP = /\([^()[\]]*\)|\[[^()[\]]*\]/g;

/** Les références restent dans sourceSegments ; elles ne font pas partie de la narration. */
export function cleanCitations(text:string,sourceIds:ReadonlySet<string>):string {
  const known=(id:string)=>sourceIds.has(id) || sourceIds.has(id.toLowerCase().replace(/^s0+(?=\d)/,'s'));
  const cleaned=text.replace(GROUP,group=>{
    const refs=group.slice(1,-1).trim().split(/[,;\s]+/);
    return refs.length>0 && refs.every(known) ? '' : group;
  });
  return cleaned===text ? text : cleaned.replace(/[ \t]{2,}/g,' ').replace(/[ \t]+([.,;:!?])/g,'$1').trim();
}

/** Un renvoi ambigu est bloqué, jamais supprimé au risque de modifier un fait. */
export function assertNoTechnicalIds(text:string):void {
  if (/(^|[^\p{L}\p{N}_])(?:d[1-6]-)?s\d+(?![\p{L}\p{N}_])/iu.test(text)) {
    throw new Error('Identifiant de passage présent dans le texte parlé : préparation bloquée avant audio et publication.');
  }
}
