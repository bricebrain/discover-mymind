import { describe, expect, it } from 'vitest';
import type { ContentDetail, ContentSegments, ContentVariant } from '../api/contents';
import { activeContentSegment, frenchBySegment, frenchCompanion, timingVerified, variantName, variantLabel, variantTrack } from './variants';

const source: ContentVariant = { key:'en-source',kind:'source',language:'en',segmentsUrl:'/source',timingStatus:'unverified',
  audio:{ source:'publisher_stream',url:'https://cdn.example.com/source.mp3',durationMs:720000,timingSource:'rss_srt' } };
const faithful: ContentVariant = { key:'fr-faithful',kind:'faithful_translation',language:'fr',derivedFrom:'en-source',segmentsUrl:'/fr',timingStatus:'none',audio:null };
const adapted: ContentVariant = { ...source,key:'en-b1',kind:'adaptation',cefrLevel:'B1',coverage:'full',derivedFrom:'en-source',timingStatus:'exact',
  audio:{ source:'r2',url:'/audio?publication=one',sha256:'hash-one',durationMs:720000,timingSource:'kokoro' } };
const doc: ContentSegments = { schemaVersion:1,variantKey:'en-source',segments:[
  { id:'s001',text:'The source, not the adaptation.',startMs:0,endMs:2000 },
  { id:'s002',text:'A second sentence.',startMs:3000,endMs:5000 },
] };
const fr: ContentSegments = { schemaVersion:1,variantKey:'fr-faithful',segments:[
  { id:'s002',text:'Une deuxième phrase.',startMs:null,endMs:null },
  { id:'s001',text:'La source, pas l’adaptation.',startMs:null,endMs:null },
] };

describe('présentation des versions', () => {
  it('affiche la nature, le niveau, la langue et la durée réelle', () => {
    expect(variantLabel(source)).toBe('Original · Anglais · 12 min');
    expect(variantLabel(faithful)).toBe('Fidèle · Français · Texte seul');
    expect(variantName({ ...faithful, key:'en-faithful', language:'en', derivedFrom:'fr-source' })).toBe('Anglais');
    expect(variantName({ ...faithful, language:'en-US' })).toBe('Anglais');
    expect(variantName({ ...source, key:'fr-source', language:'fr' })).toBe('Original');
    expect(variantLabel(adapted)).toBe('Intégral B1 · Anglais · 12 min');
    expect(variantLabel({ ...adapted,style:'dialogue' })).toBe('Intégral B1 · Anglais · 12 min · Dialogue');
    expect(variantLabel({ ...adapted,cefrLevel:null })).toBe('Intégral · Anglais non simplifié · 12 min');
    expect(variantLabel({ ...adapted,coverage:'condensed' })).toBe('Condensé B1 · Anglais · 12 min');
    expect(variantLabel({ ...adapted,coverage:'essentials' })).toBe('L’essentiel B1 · Anglais · 12 min');
  });
  it('conserve une cible stable et prend l’empreinte de l’audio courant', () => {
    const detail: ContentDetail = { content:{ id:'mon-contenu',title:'Titre' },publicationId:'one',variants:[source,adapted] };
    expect(variantTrack(detail,adapted)).toMatchObject({ targetId:'mon-contenu:en-b1',audioRef:'hash-one' });
    expect(variantTrack(detail,{ ...adapted,audio:{ ...adapted.audio!,sha256:'hash-two' } })).toMatchObject({ targetId:'mon-contenu:en-b1',audioRef:'hash-two' });
    expect(variantTrack(detail,faithful)).toBeNull();
  });
});

describe('synchronisation fiable', () => {
  it('autorise Kokoro exact ou une durée vérifiée à 1,5 s près', () => {
    expect(timingVerified(adapted,0)).toBe(true);
    expect(timingVerified(source,0)).toBe(false);
    expect(timingVerified(source,721.5)).toBe(true);
    expect(timingVerified(source,721.6)).toBe(false);
    expect(timingVerified({ ...adapted,audio:{ ...adapted.audio!,timingSource:'none' } },720)).toBe(false);
    expect(timingVerified(faithful,720)).toBe(false);
  });
  it('ne surligne aucun segment avant, entre ou après les passages', () => {
    expect(activeContentSegment(doc.segments,null)).toBe(-1);
    expect(activeContentSegment(doc.segments,1000)).toBe(0);
    expect(activeContentSegment(doc.segments,2000)).toBe(-1);
    expect(activeContentSegment(doc.segments,2999)).toBe(-1);
    expect(activeContentSegment(doc.segments,3000)).toBe(1);
    expect(activeContentSegment(doc.segments,5000)).toBe(-1);
  });
});

describe('français de la seule version active', () => {
  it('apparie la traduction fidèle par identifiant, indépendamment de l’ordre', () => {
    expect(frenchCompanion(source,[source,faithful,adapted])).toBe(faithful);
    const paired = frenchBySegment(source,doc,faithful,fr);
    expect(paired.get('s001')).toBe('La source, pas l’adaptation.'); expect(paired.get('s002')).toBe('Une deuxième phrase.');
  });
  it('n’utilise jamais le français de la source pour une adaptation', () => {
    expect(frenchCompanion(adapted,[source,faithful,adapted])).toBeUndefined();
    expect(frenchBySegment(adapted,{ ...doc,variantKey:adapted.key },faithful,fr).size).toBe(0);
  });
  it('utilise le français propre à l’adaptation et masque les anciens documents', () => {
    const adaptedDoc = { ...doc,variantKey:adapted.key,segments:[{ ...doc.segments[0]!,text:'A simple version.',fr:'Une version simple.' }] };
    expect(frenchBySegment(adapted,adaptedDoc,faithful,fr).get('s001')).toBe('Une version simple.');
    expect(frenchBySegment(adapted,doc,faithful,fr).size).toBe(0);
    expect(frenchBySegment(source,doc,faithful,{ ...fr,variantKey:'other' }).size).toBe(0);
  });
  it('ne remplit pas un passage manquant avec la traduction d’un autre identifiant', () => {
    const partial = { ...fr,segments:[fr.segments[1]!] };
    expect(frenchBySegment(source,doc,faithful,partial).has('s002')).toBe(false);
  });
  it('une traduction anglaise fidèle peut retrouver sa source française, par identifiants', () => {
    const frenchSource: ContentVariant = { ...source,key:'fr-source',language:'fr' };
    const english: ContentVariant = { ...adapted,key:'en-faithful',kind:'faithful_translation',derivedFrom:'fr-source' };
    expect(frenchCompanion(english,[frenchSource,english])).toBe(frenchSource);
    expect(frenchBySegment(english,{ ...doc,variantKey:english.key },frenchSource,{ ...fr,variantKey:'fr-source' }).get('s001')).toBe('La source, pas l’adaptation.');
  });
});
