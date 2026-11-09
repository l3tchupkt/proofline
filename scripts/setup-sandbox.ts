import { assertPayPalConfigured, parseEnv } from '@proofline/config';
import { PayPalSandboxClient } from '@proofline/integration-paypal';

async function main() {
  const env = parseEnv(process.env);
  const cfg = assertPayPalConfigured(env);

  const client = new PayPalSandboxClient({
    environment: cfg.environment,
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    webhookId: cfg.webhookId
  });

  console.log('Authenticating against PayPal Sandbox...');
  const token = await client.getAccessToken(true);
  console.log(`OAuth token acquired (length=${token.length}, redacted).`);

  const list = await client.listDisputes({ pageSize: 10 });
  console.log(`PayPal Sandbox Disputes API reachable. Found ${list.items.length} dispute(s) on first page.`);
  for (const d of list.items) {
    console.log(`- ${d.dispute_id} | ${d.reason} | ${d.status} | stage=${d.dispute_life_cycle_stage ?? 'UNKNOWN'}`);
  }
}

main().catch((error) => {
  console.error('Sandbox setup check failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});

