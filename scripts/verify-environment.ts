import { getIntegrationReadiness, parseEnv } from '@proofline/config';
import { createPostgresDatabase } from '@proofline/database';
import { LocalPrivateStorage } from '@proofline/evidence';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('PROOFLINE Environment Verification\n==================================');
  const env = parseEnv(process.env);
  const readiness = getIntegrationReadiness(env);

  console.log('Node Version:', process.version);
  console.log('Environment:', env.NODE_ENV);
  console.log('PayPal Environment:', readiness.paypalEnvironment);
  console.log('PayPal Credentials Configured:', readiness.paypalConfigured);
  console.log('PayPal Webhook ID Configured:', readiness.paypalWebhookConfigured);
  console.log('Anthropic API Key Configured:', readiness.anthropicConfigured);
  console.log('Anthropic Model Configured:', readiness.anthropicModelConfigured);
  console.log('Storage Driver:', readiness.storageDriver);
  console.log('Demo Mode:', readiness.demoMode);

  const storage = new LocalPrivateStorage(env.STORAGE_PATH);
  const storageHealth = await storage.healthCheck();
  console.log('Storage Health:', storageHealth);

  const db = createPostgresDatabase(env.DATABASE_URL);
  try {
    await db.db.execute(sql`SELECT 1`);
    console.log('PostgreSQL Connection: OK');
  } catch (error) {
    console.error('PostgreSQL Connection: FAILED -', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error('Verification failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});

