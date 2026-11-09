import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const ROOT_DIR = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      '@proofline/config': resolve(ROOT_DIR, 'packages/config/src/index.ts'),
      '@proofline/domain': resolve(ROOT_DIR, 'packages/domain/src/index.ts'),
      '@proofline/contracts': resolve(ROOT_DIR, 'packages/contracts/src/index.ts'),
      '@proofline/authorization': resolve(ROOT_DIR, 'packages/authorization/src/index.ts'),
      '@proofline/database': resolve(ROOT_DIR, 'packages/database/src/index.ts'),
      '@proofline/evidence': resolve(ROOT_DIR, 'packages/evidence/src/index.ts'),
      '@proofline/integration-paypal': resolve(
        ROOT_DIR,
        'packages/integrations/paypal/src/index.ts'
      ),
      '@proofline/integration-anthropic': resolve(
        ROOT_DIR,
        'packages/integrations/anthropic/src/index.ts'
      ),
      '@proofline/application': resolve(ROOT_DIR, 'packages/application/src/index.ts'),
      '@proofline/ui': resolve(ROOT_DIR, 'packages/ui/src/index.ts')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
    testTimeout: 30000,
    hookTimeout: 30000
  }
});

