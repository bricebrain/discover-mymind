import { describe, expect, it } from 'vitest';
import { publicationName, sharedToNote } from './share';

describe('partager vers Discover', () => {
  it('un lien partagé depuis Chrome devient une note Article attribuée à son journal', () => {
    const n = sharedToNote({ title: 'Debt ceiling fight returns | US news | The Guardian', text: 'https://www.theguardian.com/us-news/2026/oct/19/debt', url: null });
    expect(n).toEqual({ title: 'Debt ceiling fight returns', body: '', origin: 'article', sourceName: 'The Guardian', sourceUrl: 'https://www.theguardian.com/us-news/2026/oct/19/debt' });
  });
  it('un passage sélectionné garde son texte nettoyé, et le lien est retrouvé dans le texte', () => {
    const n = sharedToNote({ title: 'La dette', text: '« La dette publique atteint un record selon l’Insee, à 112 % du PIB. »\nPartager\nhttps://www.lemonde.fr/economie/article/x.html' });
    expect(n.sourceName).toBe('Le Monde');
    expect(n.sourceUrl).toBe('https://www.lemonde.fr/economie/article/x.html');
    expect(n.body).toBe('« La dette publique atteint un record selon l’Insee, à 112 % du PIB. »');
  });
  it('sans lien, une note personnelle ; domaine inconnu affiché tel quel', () => {
    expect(sharedToNote({ text: 'Une idée notée en passant, assez longue pour être gardée telle quelle.' }).origin).toBe('personal');
    expect(publicationName('https://www.example-journal.org/a')).toBe('example-journal.org');
    expect(publicationName('pas une url')).toBeNull();
  });
});
