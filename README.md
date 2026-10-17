# discover — Discover & My Mind

Application personnelle (PWA + Cloudflare Worker) pour découvrir des podcasts,
écouter leurs versions préparées par l'Atelier et écrire ses réflexions.
Architecture et contrats : [`docs/PHASE0_ARCHITECTURE.md`](docs/PHASE0_ARCHITECTURE.md).

## Structure

- `worker/` : Worker Cloudflare (API `/api`, Atelier `/atelier`, D1, R2) ; sert aussi la PWA en static assets.
- `pwa/` : PWA React + TypeScript + MUI (Vite, vite-plugin-pwa).
- `docs/` : architecture, liste des émissions de départ.
- `spikes/feed-probe/` : sonde de mesure CPU de la collecte (Phase 0).

`worker/` et `pwa/` sont deux paquets npm indépendants : les workspaces npm échouent
sur les dépendances pair de vitest. `worker/.npmrc` active `legacy-peer-deps`.

## Développement local

```bash
npm run install:all
cp worker/.dev.vars.example worker/.dev.vars   # puis remplir avec des valeurs locales
npm --prefix worker run migrate:local
npm run dev                                    # build de la PWA puis wrangler dev sur http://localhost:8787
```

Déclencher la collecte à la main (une émission par appel) pendant `wrangler dev --test-scheduled` :
`curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*+*+*+*+*"`.

Pour travailler sur l'interface avec rechargement à chaud : `wrangler dev` d'un côté,
`npm --prefix pwa run dev` de l'autre (http://localhost:5173, `/api` redirigé vers 8787).

## Tests et vérifications

```bash
npm test             # tests du Worker (vitest + @cloudflare/vitest-plugin)
npm run typecheck
```

## Déploiement

Les commandes `wrangler` se lancent **depuis `worker/`** (c'est là qu'est `wrangler.jsonc`) :

```bash
cd worker
npx wrangler secret put APP_PASSPHRASE   # 24 caractères minimum
npx wrangler secret put SESSION_EPOCH
npx wrangler secret put ATELIER_TOKEN    # 32 caractères minimum
cd .. && npm run deploy                  # crée D1 et R2 au premier déploiement
npm --prefix worker run migrate:remote
```

Révocation d'urgence de toutes les sessions : changer `SESSION_EPOCH`.

## Publication Atelier (lot 6)

Contrats, configuration de la cible Discover, reprise et tests :
[`contracts/README.md`](contracts/README.md). La Bibliothèque affiche les contenus
publiés ; leur source est lisible et écoutable. Le choix entre toutes les versions arrive au lot 7.
