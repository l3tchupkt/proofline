import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@proofline/config': resolve(__dirname, 'packages/config/src/index.ts'),
      '@proofline/domain': resolve(__dirname, 'packages/domain/src/index.ts'),
      '@proofline/contracts': resolve(__dirname, 'packages/contracts/src/index.ts'),
      '@proofline/authorization': resolve(__dirname, 'packages/authorization/src/index.ts'),
      '@proofline/database': resolve(__dirname, 'packages/database/src/index.ts'),
      '@proofline/evidence': resolve(__dirname, 'packages/evidence/src/index.ts'),
      '@proofline/integration-paypal': resolve(
        __dirname,
        'packages/integrations/paypal/src/index.ts'
      ),
      '@proofline/integration-anthropic': resolve(
        __dirname,
        'packages/integrations/anthropic/src/index.ts'
      ),
      '@proofline/application': resolve(__dirname, 'packages/application/src/index.ts'),
      '@proofline/ui': resolve(__dirname, 'packages/ui/src/index.ts')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
    testTimeout: 30000
  }
});
