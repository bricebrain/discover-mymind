import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            APP_PASSPHRASE: 'test-passphrase-long-enough-1234',
            SESSION_EPOCH: 'test-epoch',
            ATELIER_TOKEN: 'test-atelier-token-0123456789abcdef',
            LOGIN_DELAY_MS: '0',
            // Les tests de sécurité vérifient la connexion : on l'active quelle que soit la config.
            AUTH_DISABLED: 'false',
          },
        },
      }),
    ],
    test: { setupFiles: ['./test/setup.ts'] },
  };
});
