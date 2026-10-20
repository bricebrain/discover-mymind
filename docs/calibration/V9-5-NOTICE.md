# Calibration du rapprochement — annotation

Le fichier `V9-5-paires-a-annoter.csv` contient 363 paires issues du cache local de l’Atelier : 208 de même langue (`same`), 155 entre langues (`cross`). L’export contient des titres, éditeurs, dates et identifiants. Il ne contient aucun secret de configuration.

## Remplir le CSV

1. Ouvrir le CSV dans un tableur avec l’encodage **UTF-8** et le séparateur **virgule**. Les titres contenant des virgules sont protégés par des guillemets CSV. Importer les identifiants en texte pour les conserver.
2. Modifier uniquement la dernière colonne, **`meme_evenement`** : `oui` (ou `1`) si les deux contenus couvrent le même fait précis ; `non` (ou `0`) sinon. Un thème, un pays ou une personnalité en commun ne suffisent pas.
3. Laisser vide en cas d’incertitude. Ne pas déduire la réponse du score : celui-ci mesure une proximité de texte, pas une certitude événementielle.
4. Conserver les 13 colonnes, leurs en-têtes, les identifiants, les scores et les lignes. Sauvegarder une copie en **CSV UTF-8, séparateur virgule**, par exemple `V9-5-paires-annotees.csv`. Le nombre décimal des scores doit garder son point.
5. Fournir le chemin du fichier rempli dans le chat. Codex contrôlera les colonnes, les annotations et la correspondance avec l’original avant toute évaluation.

Exemples : deux médias décrivant la même décision de banque centrale → `oui`. Deux décisions différentes de cette banque, même semaine → `non`. Deux articles généraux sur l’inflation → `non`, sauf s’ils couvrent la même publication chiffrée ou le même événement précis.

Une annotation partielle est possible. Pour un premier passage, répartir les réponses entre `same` et `cross` et entre scores faibles et élevés ; inclure des `oui` et des `non` lorsque le contenu le justifie. La suite précisera si l’échantillon reste insuffisant.

## Ce qui suivra

Codex relira le CSV, mesurera précision et rappel puis proposera, si les données le permettent, `relatedSameLanguageScore`, `relatedCrossLanguageScore` et `relatedDoubtScore`. Les faux regroupements par transitivité seront examinés. Les seuils ne seront modifiés qu’après accord explicite.

L’échantillon est stratifié par score, donc sa précision brute n’est pas une estimation de la précision sur tout le corpus. Il comprend 105 paires d’un même éditeur et 3 paires de textes identiques, alors que le regroupement réel les exclut. L’analyse distinguera ces cas avant de recommander des réglages.

`relatedLlm` reste inchangé. Cette phase n’effectue aucun appel payant, aucune publication, aucun déploiement ni aucune migration.
