/**
 * Nettoyage d'un article collé depuis un site de presse : lignes parasites (cookies, « Lire aussi », abonnement,
 * partage, crédits photo, publicité, temps de lecture…) retirées, phrases coupées par des retours à la ligne recollées.
 * Prudent : une ligne n'est retirée que si elle est courte et correspond clairement à un motif connu.
 */
const BOILERPLATE: RegExp[] = [
  /\bcookies?\b/i, /\bconsentement\b/i, /\bconsent\b/i, /^(tout )?accepter( et fermer)?$/i, /^(tout )?refuser$/i, /^accept( all)?$/i,
  /^reject( all)?$/i, /^(manage|gérer) (my )?(preferences|préférences|cookies)/i, /^paramétrer/i,
  /^(à )?lire aussi\b/i, /^lire la suite\b/i, /^read more\b/i, /^related\b/i, /^more on this story\b/i, /^voir aussi\b/i, /^sur le même sujet\b/i,
  /^(abonnez-vous|s'abonner|s’abonner|je m'abonne|je m’abonne)\b/i, /^subscribe\b/i, /^sign up\b/i, /\bnewsletter\b/i,
  /^(contenu|article) réservé aux abonnés/i, /^réservé aux abonnés/i, /^(publicité|advertisement|sponsored|contenu sponsorisé)$/i,
  /^(partager|share)( (sur|on) .+)?$/i, /^(facebook|twitter|x|whatsapp|linkedin|e-?mail|email|copier le lien|copy link|imprimer|print)$/i,
  /^(photo|image|illustration|crédit|credit)s?\s*:/i, /^©/, /\b(getty images|afp photo|reuters\/|ap photo|shutterstock)\b/i,
  /^temps de lecture\s*:?/i, /^\d+\s*min(utes?)?\s*(de lecture|read)$/i, /^(écouter cet article|listen to this article)/i,
  /^(ajouter à mes favoris|sauvegarder|save)$/i, /^(commenter|comments?|\d+ commentaires?)$/i,
];
const MAX_BOILERPLATE_LENGTH = 140;

export interface CleanResult { text: string; removedLines: number; joinedLines: number }

export function cleanPastedArticle(raw: string): CleanResult {
  const lines = raw.replace(/\r\n?/g, '\n').replace(/ /g, ' ').split('\n').map((l) => l.replace(/[ \t]+$/g, ''));
  let removedLines = 0, joinedLines = 0;
  const kept: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t && t.length <= MAX_BOILERPLATE_LENGTH && BOILERPLATE.some((re) => re.test(t))) { removedLines++; continue; }
    if (t && t.length <= 2 && !/[A-Za-z0-9À-ÿ]/.test(t)) { removedLines++; continue; } // puces, séparateurs isolés
    kept.push(line);
  }
  // Recoller une phrase coupée : ligne sans ponctuation finale suivie d'une ligne qui commence en minuscule.
  const joined: string[] = [];
  for (const line of kept) {
    const prev = joined[joined.length - 1];
    if (prev && prev.trim() && line.trim() && !/[.!?:;»"”)\]]$/.test(prev.trim()) && /^[a-zà-ÿ(«"“]/.test(line.trim())) {
      joined[joined.length - 1] = `${prev.trimEnd()} ${line.trim()}`;
      joinedLines++;
    } else joined.push(line);
  }
  const text = joined.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text, removedLines, joinedLines };
}

/** Ne propose le nettoyage que pour un vrai collage d'article, et seulement s'il change quelque chose. */
export const worthCleaning = (raw: string, r: CleanResult) => raw.length >= 200 && (r.removedLines > 0 || r.joinedLines > 0);
