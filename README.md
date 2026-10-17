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

Pour travailler sur l'interface avec rechargement à chaud : `wrangler dev` d'un côté,
`npm --prefix pwa run dev` de l'autre (http://localhost:5173, `/api` redirigé vers 8787).

## Tests et vérifications

```bash
npm test             # tests du Worker (vitest + @cloudflare/vitest-plugin)
npm run typecheck
```

## Déploiement

```bash
npx --prefix worker wrangler secret put APP_PASSPHRASE   # 24 caractères minimum
npx --prefix worker wrangler secret put SESSION_EPOCH
npx --prefix worker wrangler secret put ATELIER_TOKEN    # 32 caractères minimum
npm run deploy                                           # crée D1 et R2 au premier déploiement
npm --prefix worker run migrate:remote
```

Révocation d'urgence de toutes les sessions : changer `SESSION_EPOCH`.
