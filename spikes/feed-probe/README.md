# Sonde de collecte RSS (Phase 0)

Worker jetable qui a servi à mesurer, le 2026-10-17, le coût réel de la collecte
des 29 émissions de `docs/seed-shows.json` sur Cloudflare Workers.

Il a été déployé sous le nom `discover-feed-probe`, mesuré avec `wrangler tail`
(champ `cpuTime`), **puis supprimé** (`wrangler delete`). Ce n'est pas du code de
production : `worker/src/feeds.ts` reprendra le principe de lecture en flux.

## Modes

- `stream` : lecture en flux, arrêt après 15 épisodes, abandon du reste du fichier.
- `full` : téléchargement et analyse du flux complet (approche naïve).
- `cond` : `stream`, puis seconde requête avec `If-None-Match` / `If-Modified-Since`.

## Résultats (temps CPU par exécution)

| Mesure | Résultat |
|---|---|
| `stream`, 1 émission par exécution (58 mesures) | médiane **3 ms**, 90 % ≤ **6 ms**, maximum **15 ms** (Tech Café, 272 Ko lus) |
| Octets lus en `stream` | 21 à 272 Ko par flux (au lieu de 0,5 à 15,6 Mo) |
| `full` sur les gros flux | Bloomberg Intelligence 87 ms · After Foot 99 ms · Tech&Co 53 ms · Bloomberg Tech 22 ms |
| `stream`, 3 émissions par exécution | 15 à 25 ms |
| `stream`, 29 émissions par exécution | 74 ms (6 s d'attente réseau) |
| Réponse `304` (requête conditionnelle) | 26 émissions sur 29 (Today in Focus : ni ETag ni Last-Modified ; T'as qui en Histoire ? et RFI répondent toujours 200) |
| GUID et audio présents | 29 sur 29 (Power On n'a que 4 épisodes pour l'instant) |

Les exécutions à 74–99 ms n'ont pas été interrompues : soit le compte est déjà
en offre payante, soit l'offre gratuite a toléré le dépassement. La conception
retenue reste donc calibrée sur la limite **gratuite de 10 ms**
(voir `docs/PHASE0_ARCHITECTURE.md` § 7.1).

## Relancer

```bash
npx wrangler deploy
npx wrangler secret put PROBE_TOKEN
npx wrangler tail discover-feed-probe --format json
# …requêtes ?t=<jeton>&mode=stream&ids=<id>…
npx wrangler delete discover-feed-probe
```
