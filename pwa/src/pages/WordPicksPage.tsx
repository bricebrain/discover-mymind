import { WordPicksList } from '../vocabulary/WordPicksList';
export function WordPicksPage() {
  return <div className="mx-auto max-w-[720px] px-4 pb-8 pt-4">
    <h1 className="sr-only">Mots gardés</h1>
    <p className="m-0 mb-4 text-sm leading-relaxed text-muted-foreground">Les mots et expressions choisis pendant la lecture sont envoyés à EnglishFluency par l’Atelier. Supprimer une sélection ici ne retire pas un mot déjà reçu là-bas.</p>
    <WordPicksList />
  </div>;
}
