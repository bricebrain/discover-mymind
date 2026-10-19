# Chantier E — Export complet (lot 12)

Branche `glm/e-export`, worktree `../discover-mymind-glm-e`. Réalisé par GLM 5.2 le 19 octobre 2026,
relu et fusionné par Claude Opus. **Aucune migration** (aucun changement de schéma : la 0014 et la 0015
restent les dernières), aucun déploiement, aucune génération payante.

## Fichiers modifiés

| Fichier | Nature |
|---|---|
| `worker/src/routes/export.ts` | **nouveau** — export v2 (JSON + Markdown), inventaire, avertissement audios |
| `worker/src/index.ts` | point d'entrée : `GET /api/export` → `exportData` (2 lignes, fichier partagé sensible signalé) |
| `worker/test/export.test.ts` | **nouveau** — 9 tests (contenu v2, secrets, v1 inchangé, Markdown) |
| `pwa/src/pages/SettingsPage.tsx` | section « Mes données » : bouton « Exporter tout (JSON + Markdown) », l'ancien bouton conservé sur `?v=1` |
| `docs/GLM_E.md` | ce document |

`reflections.ts` n'est **pas modifié** : `exportAll` (v1) reste le code d'origine, servi via `?v=1`.
`mind.test.ts` n'est pas modifié (voir « Compatibilité »). Aucun fichier de Claude Opus (My Mind, sw,
vite.config, App.tsx) n'a été touché.

## Routage

- `GET /api/export` → **v2** par défaut (JSON complet, `schemaVersion: 2`).
- `GET /api/export?v=1` → v1 **inchangé** (mêmes clés, même `Content-Disposition`, même code).
- `GET /api/export?v=2&format=markdown` → document Markdown seul (`text/markdown`, pièce jointe `.md`).
- `?v=<autre>` → 400 `invalid_version`.

## Inventaire des données

| Donnée | Décision | Pourquoi |
|---|---|---|
| Notes `reflections` (corbeille incluse, marquée `deletedAt`) | incluse | tout ce qui appartient à l'utilisateur ; la corbeille purge à 30 jours |
| Nouveaux champs `origin`, `source_name`, `source_url` | inclus | notes « Article » (migration 0015) : journal et lien |
| `english_content_id` | inclus | rattache la note à sa publication anglaise |
| Liens `reflection_links` | inclus | `target_title` conservé : le lien reste lisible si la cible disparaît |
| `shows` (podcasts **et** chaînes YouTube : `source_type`, `channel_id`) | inclus (configuration) | abonnements de l'utilisateur |
| — colonnes de santé de collecte (`etag`, `next_check_at`, `last_error`, `consecutive_failures`, `max_items`…) | exclues | état interne technique, recalculé par le cron |
| Épisodes sauvegardés (`state='saved'`) | inclus | comme en v1 |
| Épisodes non sauvegardés | exclus | flux éphémère de découverte, volume sans valeur de sauvegarde |
| `listening_progress` (dont `audio_ref`) | incluse | progression d'écoute ; `audio_ref` est un sha256 ou l'URL officielle, pas un secret |
| `prepare_queue` | incluse (500 plus récentes) | statut, options, dates, erreurs |
| — `lease_token`, `lease_owner`, `lease_expires_at`, `commit_token` | exclus | jetons de fonctionnement (test « aucun secret ») |
| `queue_events` | exclu | journal de notification dérivé |
| Contenus préparés + publication courante (manifeste R2) | inclus | variantes, segments complets, fichiers avec sha256/taille |
| Publications historiques (`superseded`, `failed`, `abandoned`) | exclues | remplacées ; l'export porte la publication courante de chaque contenu |
| `variants` (D1) | lu pour `timing_status` | complément du manifeste |
| `dossiers` et `dossier_runs` | inclus | sources capturées (instantanés complets avec texte) et options |
| `app_settings` (`auto_prepare_enabled`) | inclus | réglage de l'utilisateur |
| **Audios (blobs R2)** | **non inclus** | voir « Stratégie audios » |
| `sessions`, `login_attempts` | exclus | sécurité |
| `push_subscriptions`, `push_deliveries` | exclus | endpoint et clés push : secrets |
| `search_index` (FTS5) | exclu | dérivé des notes, reconstruit |
| `publication_guards`, `publication_gc` | exclus | interne de publication |
| Secrets d'environnement (`APP_PASSPHRASE`, `SESSION_EPOCH`, `ATELIER_TOKEN`) | jamais | testé explicitement |

## Format v2 (résumé)

```jsonc
{
  "schemaVersion": 2, "exportedAt": "…", "audioNotice": "…",
  "reflections": [{ /* notes v1 + origin, sourceName, sourceUrl, deletedAt marqué */ }],
  "shows": [{ "id", "title", "publisher", "sourceType", "channelId", "feedUrl", "appleId", "imageUrl",
              "language", "category", "titleFilter", "autoPrepare", "autoPreset", "autoLevel", "enabled", "createdAt" }],
  "savedEpisodes": [{ "id", "showId", "title", "show", "audioUrl", "publishedAt", "videoId" }],
  "listeningProgress": [{ "targetType", "targetId", "audioRef", "positionMs", "durationMs", "completed", "updatedAt" }],
  "preparations": [{ "id", "kind", "ref", "options", "status", "stage", "attempts", "maxAttempts",
                     "contentId", "error", "createdAt", "updatedAt" }],
  "contents": [{
    "id", "title", "originalLanguage", "sourceType", "sourceRef", "sourceUrl", "category", "editorial",
    "createdAt", "updatedAt", "sources",                      // sources du manifeste (dossiers)
    "publication": { "id", "revision", "seq", "publishedAt" },
    "variants": [{ "key", "kind", "language", "cefrLevel", "style", "derivedFrom", "coverage", "timingStatus",
                   "audio": { "origin", "source", "durationMs", "timingSource",
                              "sha256", "sizeBytes", "streamUrl", "playbackPath" },   // null si sans audio
                   "segments": [{ "id", "text", "fr", "speaker", "startMs", "endMs", "sourceSegments", "provenance" }],
                   "segmentsError": null }],
    "files": [{ "path", "sha256", "size", "contentType" }],
    "error": null                                            // manifest_unavailable : l'export continue
  }],
  "dossiers": [{ "id", "title", "version", "createdAt", "updatedAt", "sources",
                 "runs": [{ "id", "version", "title", "sources", "options", "createdAt",
                            "preparation": { "status", "contentId" } | null }] }],
  "appSettings": { "autoPrepareEnabled": true },
  "markdown": "…"                                            // même document que format=markdown
}
```

Le Markdown suit l'ordre demandé : **notes** (corbeille et articles marqués), **contenus préparés**
(texte anglais puis traduction française en citation, par paragraphe ; ligne audio avec empreinte),
**dossiers** (sources et exécutions), puis annexes compactes (émissions suivies, épisodes sauvegardés,
progression). L'avertissement audios figure en tête du JSON et du document.

## Stratégie audios

1. Aucun audio dans le JSON. Chaque variante liste `sha256`, `sizeBytes`, `origin`, `durationMs`,
   `timingSource` (ou `streamUrl` pour un flux éditeur) et un `playbackPath` **relatif**
   (`/api/contents/:id/variants/:key/audio?publication=…`), jamais une URL absolue présentée comme
   une sauvegarde.
2. L'`audioNotice` (JSON et Markdown) dit explicitement : les adresses de lecture exigent la session et
   disparaissent si le contenu est supprimé — une sauvegarde réelle = télécharger les fichiers puis
   vérifier leur SHA-256.
3. **Zip par contenu : écarté**, documenté comme limite. Construire un zip sans dépendance suppose
   CRC32 + en-têtes binaires écrits à la main, et le traitement de plusieurs Mo d'audio dépasse
   vraisemblablement le CPU du Worker gratuit (10 ms). Piste future : un script local (Mac) qui lit
   l'export JSON et récupère chaque fichier par son empreinte, ou un zip produit par l'Atelier.

## Compatibilité v1

- Le code v1 (`reflections.exportAll`) est inchangé et servi via `?v=1` ; test dédié (clés exactes,
  corbeille toujours exclue du v1, `schemaVersion` 1).
- `mind.test.ts` (non modifié) appelle `/api/export` sans paramètre : il reste vert parce que le JSON v2
  conserve les clés `reflections` (même forme) et `markdown` (les notes y figurent de la même façon).
- Le bouton historique de la PWA appelle désormais `/api/export?v=1` explicitement : comportement
  identique à avant, seul le libellé devient « Export historique (notes et émissions) ».

## Commandes et résultats (worktree)

| Commande | Résultat |
|---|---|
| `worker/ : npx tsc --noEmit -p .` | OK |
| `worker/ : npm test` | **20 fichiers, 245 tests verts** (dont 9 nouveaux) |
| `pwa/ : npx tsc --noEmit -p .` | OK |
| `pwa/ : npx vitest run` | **11 fichiers, 66 tests verts** |
| `pwa/ : npm run build` | OK (33 entrées précachées) |

## Limites

- **CPU du Worker gratuit (10 ms)** : chaque contenu coûte une lecture R2 du manifeste + une lecture et
  un `JSON.parse` par variante. Le JSON v2 embarque en outre le Markdown (textes présents deux fois),
  choix assumé pour garder un JSON autonome et le test v1 existant vert. Pas de pagination dans cette
  livraison : mesuré sur le jeu de test (4 notes, 1 contenu à 2 variantes, 1 dossier, 2 émissions,
  1 épisode sauvegardé, 2 progressions, 2 préparations) → **≈ 10,4 ko**. La volumétrie personnelle
  actuelle (dizaines de contenus, textes bornés par la collecte) doit rester dans les clous ;
  **à retester sur les données réelles après déploiement**. Si l'export grossit : servir le Markdown
  uniquement via `format=markdown`, puis paginer (`?part=`).
- `preparations` plafonnées aux 500 plus récentes (les entrées terminées sont de toute façon
  supprimables depuis la file).
- Un manifeste R2 indisponible n'interrompt pas l'export : le contenu sort avec
  `error: "manifest_unavailable"` ; de même `segmentsError` par variante.
- Import / restauration automatique : hors périmètre (export exploitable uniquement), conformément au plan.

## Étapes manuelles (Claude Opus)

1. Relire la branche `glm/e-export`, fusionner dans `main` (rien à coordonner avec `convert/`).
2. Déployer worker + PWA ; **aucune migration D1** à appliquer.
3. Après déploiement : lancer « Exporter tout » depuis les Réglages sur les données réelles et noter
   taille/durée ; vérifier que le Markdown se lit bien (notes → contenus bilingues → dossiers).
