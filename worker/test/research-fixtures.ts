import type { Evidence, ResearchArticle } from '../src/research/types';

export const sources: Evidence[] = [
  { id: 's1', title: 'Une étude et sa méthode', url: 'https://inria.fr/recherche', text: 'Une expérience contrôlée mesure les effets et les limites de la méthode. '.repeat(40) },
  { id: 's2', title: 'Une réplication indépendante', url: 'https://cnrs.fr/recherche', text: 'Les résultats demandent une réplication et restent dépendants du protocole. '.repeat(40) },
  { id: 's3', title: 'Des résultats complémentaires', url: 'https://inria.fr/limites', text: 'La méthode ne démontre pas une généralisation à toutes les situations. '.repeat(40) },
];
const paragraph = 'Les chercheurs évaluent une méthode dans des conditions contrôlées pour comprendre ses effets. Les résultats observés dépendent du protocole utilisé et des caractéristiques des participants. Une comparaison indépendante reste nécessaire avant de généraliser les observations à des situations différentes. Les documents disponibles décrivent les limites de cette expérience et ne permettent pas de conclure à une amélioration universelle. Cette distinction aide à comprendre ce qui a été mesuré et ce qui demeure une hypothèse de recherche. La prudence consiste à examiner les données plutôt que les seules annonces, en tenant compte du contexte et des incertitudes exposées par les équipes.';
export const article: ResearchArticle = { title: 'Comment évaluer les capacités des nouvelles IA ?', summary: 'Une explication des méthodes employées pour évaluer une nouvelle intelligence artificielle et des limites des résultats.',
  topicKey: 'evaluation-capacites-ia', sources,
  sections: ['La question de recherche', 'Comment les chercheurs procèdent', 'Les résultats observés', 'Les limites de l’expérience', 'Ce que cela peut changer']
    .map(heading => ({ heading, text: paragraph, sourceIds: ['s1', 's2', 's3'] })),
};
export const searchResponse = {
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Les évaluations des nouvelles IA : méthode, résultats et limites.' }] },
    groundingMetadata: { webSearchQueries: ['évaluation intelligence artificielle étude'],
      groundingChunks: sources.map(source => ({ web: { uri: source.url, title: source.title } })),
      searchEntryPoint: { renderedContent: '<div>Recherche Google</div>' },
    } }],
};
