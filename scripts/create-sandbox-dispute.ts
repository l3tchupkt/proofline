import { assertPayPalConfigured, parseEnv } from '@proofline/config';
import { PayPalSandboxClient } from '@proofline/integration-paypal';

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function main() {
  const env = parseEnv(process.env);
  const cfg = assertPayPalConfigured(env);

  const buyerTransactionId = getArg('transaction');
  const amountValue = getArg('amount') ?? '10.00';
  const currencyCode = (getArg('currency') ?? 'USD').toUpperCase();
  const reason = getArg('reason') ?? 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED';
  const buyerPayerId = getArg('buyer') ?? env.PAYPAL_SANDBOX_BUYER_PAYER_ID;

  if (!buyerTransactionId || !buyerPayerId) {
    console.error(
      'Usage: pnpm sandbox:create-dispute --transaction=<BUYER_TXN_ID> --buyer=<SANDBOX_BUYER_PAYER_ID_OR_EMAIL> [--amount=10.00] [--currency=USD] [--reason=MERCHANDISE_OR_SERVICE_NOT_RECEIVED]'
    );
    process.exit(1);
  }

  const client = new PayPalSandboxClient({
    environment: cfg.environment,
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret
  });

  const created = await client.createSandboxBuyerDispute({
    buyerPayerIdOrEmail: buyerPayerId,
    buyerTransactionId,
    currencyCode,
    amountValue,
    reason,
    note: 'Sandbox verification dispute opened via PayPal buyer testing workflow.'
  });

  console.log('Sandbox dispute created:', JSON.stringify(created, null, 2));
}

main().catch((error) => {
  console.error('Create sandbox dispute failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});

