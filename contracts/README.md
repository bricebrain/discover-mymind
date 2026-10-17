# Contrat de publication Discover (lot 6)

`manifest.schema.json` et `segments.schema.json` définissent la structure (JSON Schema draft 7).
Les contraintes entre champs sont vérifiées par `worker/src/publications/validation.ts`
et `convert/manifeste_validation.py`. Les deux exécutent les mêmes fixtures.
Les contraintes dépendant de D1 sont vérifiées à la déclaration et au commit :
source existante, enclosure exacte, variantes conservées et bail toujours valide.
Les fixtures contextuelles transmettent `currentVariants` et `episodeAudioUrl` aux deux validateurs.

- Taille exprimée en octets : 95 000 000 par fichier, 300 000 000 par publication.
- Un fichier de segments est limité à 5 000 000 octets pour borner la mémoire du Worker.
- Les textes sont validés un fichier à la fois au commit ; les audios ne sont jamais chargés en mémoire.
- Une source ou une traduction fidèle a une couverture `full` par défaut. Un niveau cible
  dans un ancien bundle ne transforme pas une traduction fidèle en adaptation.
- Sans audio, ou avec `timingSource: none`, tous les timestamps sont `null`.
- La fidélité sémantique de `fr` relève de l’Atelier et de la revue humaine.
- Les fichiers R2 sont immuables, dédupliqués par SHA-256 et servis par identifiants métier.

## Génération et tests

Depuis la racine Discover :

```sh
npm --prefix worker run contracts:generate
npm test
npm run typecheck
npm --prefix pwa test
npm run build
```

Ajv est une dépendance de développement : il génère les validateurs autonomes avant
les tests et le déploiement. Pas de compilation dynamique dans le Worker.
Les fichiers `*.generated.js` et leurs déclarations sont versionnés ; les régénérer après toute modification des schémas.

Depuis `convert/` :

```sh
python3 -m pip install -r requirements.txt
python3 -m unittest discover -s tests -q
```

Par défaut, le validateur Python lit `../discover-mymind/contracts` ;
`DISCOVER_CONTRACTS_DIR` permet de déplacer ces schémas.

## Publication depuis l’Atelier

Copier `config_discover.example.json` vers `config_discover.json` (ignoré par Git),
renseigner `workerUrl` et `atelierToken`, et protéger ce fichier avec `chmod 600`.
La publication manuelle **Publier dans Discover** est disponible pour les bundles
YouTube dont la source et la traduction fidèle sont complètes. L’analyse pédagogique
n’est pas requise. Source française : original FR et traduction EN avec son audio
Kokoro à jour s’il existe. Source anglaise : original EN et traduction française en texte.
Les publications automatiques existantes continuent à viser EnglishFluency ; le double envoi arrive au lot 12.

La déclaration retourne les seuls fichiers manquants. Après un arrêt, relancer le
même bundle reprend cette publication ; un manifeste déjà `ready` ne crée aucune révision.
Les étapes et erreurs apparaissent dans l’Atelier ; le jeton n’est jamais renvoyé au navigateur.

## Concurrence et entretien

Le verrou de commit porte un jeton ; une assertion SQL dans le batch D1 vérifie
ce jeton, le pointeur courant et, le cas échéant, le bail. Une publication devenue
ancienne reste `superseded` sans modifier les métadonnées visibles.
Le retrait des variantes est revérifié au commit, même si la déclaration précédait une autre publication.

Le cron de la minute 17 effectue le nettoyage : un verrou `committing` sans activité
depuis 15 minutes est récupéré ; un envoi inactif depuis 48 heures est abandonné.
Les blobs réservés pour suppression sont protégés contre toute nouvelle référence
par un trigger D1. Au plus 10 blobs puis 10 manifestes expirés sont supprimés par passage.
Les références actives et les révisions remplacées depuis moins de 7 jours sont conservées.
Les routes média acceptent `?publication=<id>` pour terminer la lecture d’une révision
remplacée pendant ce délai, sans accepter de clé R2.

Les tests sont locaux ; les essais de lecture et de reprise sur le Fold7 réel restent manuels.
Les mesures CPU et quotas de production doivent être confirmées sur des contenus réels.
