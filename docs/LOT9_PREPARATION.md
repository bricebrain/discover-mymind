# Lot 9 — Versions préparées

L’Atelier Mac consomme désormais les demandes jusqu’à la publication dans Discover. Les sources déjà importées au lot 8 sont reprises. Le téléphone n’exécute ni Gemini ni Kokoro.

## Utilisation

Dans Discover, choisir **Préparer en anglais**, la couverture (Intégral, Condensé, L’essentiel), le niveau et, pour les versions courtes, la durée. Lancer l’Atelier Mac et ouvrir **À préparer**. La narration est proposée par défaut ; le dialogue utilise deux voix. Pour une source française, la traduction fidèle intégrale est facultative. La copie de l’audio original reste explicite ; le streaming officiel est conservé par défaut.

La clé Gemini existante de `config_ia.json` est utilisable. Elle peut aussi être définie dans `config_discover.json` (`geminiApiKey`) ou dans `GEMINI_API_KEY`. Les options `geminiModel` et `geminiJudgeModel` du fichier Discover permettent de choisir séparément le modèle d’écriture et celui du contrôle. Aucun secret n’est transmis au navigateur. Les modèles et l’environnement `venv-tts` Kokoro déjà installés sont utilisés, sans nouvelle dépendance.

## Préparation et contrôles

- Plan portant sur tous les segments, extraction de chaque bloc de 1 500 mots au maximum, puis écriture avec continuité. Chaque paragraphe conserve ses identifiants sources et sa traduction française.
- L’intégral conserve les faits et événements de chaque bloc. Le condensé garde les explications principales ; l’essentiel privilégie les conclusions et leurs réserves. Les publicités sont exclues ; une annonce d’entreprise journalistique est conservée.
- Un second appel Gemini juge le texte anglais et sa traduction française contre les sources citées. Pour l’intégral, chaque fait extrait reçoit un contrôle distinct. Les noms et nombres absents des passages cités sont signalés localement ; les seuils de langue restent des indicateurs explicites, avec lecture facultative du référentiel EnglishFluency existant.
- Les contradictions ou publicités détectées entraînent une réécriture automatique, une fois. Une version encore rejetée doit être corrigée ou régénérée. Une version `review` attend **Lire et vérifier**, puis **Accepter et publier**. Les corrections repassent le contrôle de fidélité. L’accord est lié au texte, à l’évaluation, aux options et à l’empreinte des sources ; il ne vaut pas pour une version modifiée.
- Kokoro est calibré à environ 130 mots/minute. Les timings proviennent des échantillons audio de chaque paragraphe. La durée MP3 réelle est mesurée ; une correction de débit est tentée si la cible sort de ±20 %. Si elle reste hors cible, une nouvelle relecture explicite est nécessaire.
- La traduction fidèle française→anglais conserve chaque segment original et passe un contrôle distinct. Ses promotions restent présentes puisqu’elle traduit intégralement la source.

## Reprise et publication

Les réponses Gemini structurées sont validées puis mises en cache par modèle, requête et schéma. Les erreurs de format sont reprises trois fois au maximum. Un HTTP 429 conserve les étapes et rend le bail sans pénalité ; reprise après une heure ou au redémarrage. Un plafond local de 80 appels / 240 000 jetons par préparation arrête le traitement avec erreur plutôt qu’une boucle de reprise horaire. Le bouton Arrêter interrompt l’attente.

Les WAV intermédiaires Kokoro sont réutilisés par texte, voix, débit et version de modèle. Les audios et timings finaux sont contrôlés par empreinte. Les trois tentatives de la file, les renouvellements de bail et l’arrêt sur perte de bail restent actifs.

Le Worker refuse de terminer une demande sans la variante anglaise demandée, son audio Kokoro et une évaluation acceptée. Une demande de traduction fidèle ou de copie originale impose aussi ces fichiers. Les variantes déjà publiées sont conservées via `GET /atelier/contents/:id/manifest` protégé par Bearer. Une source dont les identifiants seraient réinterprétés bloque le remplacement ; aucun ancien renvoi n’est changé silencieusement. Une republication identique peut terminer une nouvelle demande sans créer de publication supplémentaire.

L’étape `review` ne reçoit aucun bail automatiquement ; seule une action explicite locale peut reprendre cette demande. Les originaux RSS dont la durée ne correspond pas à l’audio téléchargé restent lisibles sans surlignage trompeur.

## Automatisation

Après collecte, seules les émissions déjà configurées avec `auto_prepare=1` alimentent la file. En production, il s’agit de **L’édito éco**. Seul le dernier épisode récent (30 jours) est retenu, avec B1 intégral jusqu’à 25 min et condensé de 12 min au-delà. Aucun historique n’est importé en masse. Une demande annulée, échouée ou déjà terminée n’est jamais recréée automatiquement. Le Mac doit être allumé avec l’Atelier lancé pour la préparation.

## Vérification

Les tests couvrent les références, les contrôles et décisions de relecture, l’accord lié à la durée, le cache/quota, la conservation des variantes et de la copie originale, les timings réels, ainsi que le refus de publication incomplète et la sélection automatique du dernier épisode.

Corpus réel du 17 octobre 2026, conservé hors dépôt : BBC Huckleberry Finn (audio transcrit par MacWhisper), Storiavoce sur la naissance du monothéisme, Bloomberg sur les semi-conducteurs et Apple, Better Offline sur les obligations (dialogue), Bloomberg sur les résultats bancaires (essentiel). Les essais ont entraîné un renforcement du minimum de détail de l’intégral, des références contraintes par schéma et de l’appariement de la traduction fidèle. Les alertes de noms traduits ou de nombres reformulés restent visibles en relecture, même lorsque le juge accepte le fond.

La vérification sur le Fold7 physique, plié/déplié et écran verrouillé, reste manuelle. Le navigateur intégré ne permet pas ici de confirmer les dimensions physiques demandées. La fenêtre complète de 24 h de mesures du cron reste également à vérifier (§ 17).

Validation automatisée : **156 tests Worker + 29 tests PWA + 158 tests Atelier**. Types et build réussis. Atelier commits `f01ed67`, `7cbcfbf` et `a2c7503` ; Worker `8da90262-86f7-46fa-9c88-bf410d75009e`. Le parcours BBC complet a publié dans l’environnement local une source et un intégral B1 de 350 mots, audio réel de 159 secondes, français et navigation par paragraphe vérifiés dans Discover. Aucun contenu de contrôle n’a été publié en production.

Mesure réelle du condensé Bloomberg (43 min 18 s) : 1 484 mots, 13 paragraphes. La première synthèse de 892 300 ms dépasse la cible ; le débit passe automatiquement de 0,700 à 0,868. La synthèse corrigée dure **675 580 ms, soit 11 min 16 s**, dans la tolérance de la cible de 12 min. Les treize timings exacts sont valides et restent dans la durée audio.

La validation qualitative finale des cinq écoutes par l’utilisateur reste ouverte dans § 13. Les intégrales raccourcies de plus de 15 % par rapport aux passages substantiels demandent une relecture, même avec un juge favorable. Le mode dialogue produit des échanges directs Host/Guest ; le contrôle signale les ajouts narratifs et les possibilités transformées en faits.
