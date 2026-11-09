import { z } from 'zod';

export class ConfigurationError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ConfigurationError';
    this.code = code;
    this.details = details;
  }
}

const booleanFromEnv = z
  .union([z.boolean(), z.string()])
  .transform((val) => {
    if (typeof val === 'boolean') return val;
    return val.toLowerCase() === 'true' || val === '1';
  });

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NEXT_PUBLIC_API_URL: z
    .union([z.literal(''), z.string().url()])
    .default('http://localhost:4000'),
  CORS_ORIGIN: z.string().default('http://localhost:3000,http://127.0.0.1:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters long'),
  SESSION_COOKIE_SECURE: booleanFromEnv.default(false),

  PAYPAL_ENVIRONMENT: z
    .literal('sandbox', {
      error: () => 'Hackathon build restricts PAYPAL_ENVIRONMENT strictly to "sandbox"'
    })
    .default('sandbox'),
  PAYPAL_CLIENT_ID: z.string().optional().default(''),
  PAYPAL_CLIENT_SECRET: z.string().optional().default(''),
  PAYPAL_WEBHOOK_ID: z.string().optional().default(''),
  PAYPAL_SANDBOX_BUYER_PAYER_ID: z.string().optional().default(''),

  ANTHROPIC_API_KEY: z.string().optional().default(''),
  ANTHROPIC_MODEL: z.string().optional().default(''),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_PATH: z.string().min(1).default('./storage/evidence'),
  S3_BUCKET: z.string().optional().default(''),
  S3_REGION: z.string().optional().default(''),
  S3_ENDPOINT: z.string().optional().default(''),
  S3_ACCESS_KEY_ID: z.string().optional().default(''),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(''),

  DEMO_MODE: booleanFromEnv.optional(),
  DEMO_LOGIN_EMAIL: z.string().email().default('merchant@demo.proofline.local'),
  DEMO_LOGIN_PASSWORD: z.string().min(8).default('ProoflineDemo!2026')
});

export type AppEnv = Omit<z.infer<typeof EnvSchema>, 'DEMO_MODE'> & {
  DEMO_MODE: boolean;
};

export interface IntegrationReadiness {
  paypalEnvironment: 'sandbox';
  paypalConfigured: boolean;
  paypalWebhookConfigured: boolean;
  anthropicConfigured: boolean;
  anthropicModelConfigured: boolean;
  storageDriver: 'local' | 's3';
  demoMode: boolean;
}

export function parseEnv(raw: Record<string, string | undefined> = process.env): AppEnv {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new ConfigurationError(
      'ENV_VALIDATION_FAILED',
      `Environment validation failed:\n- ${issues.join('\n- ')}`,
      { issues }
    );
  }
  const resolvedDemoMode = result.data.DEMO_MODE ?? result.data.NODE_ENV !== 'production';
  if (
    result.data.NODE_ENV === 'production' &&
    resolvedDemoMode &&
    result.data.DEMO_LOGIN_PASSWORD === 'ProoflineDemo!2026'
  ) {
    throw new ConfigurationError(
      'INSECURE_DEMO_CREDENTIALS',
      'Production deployments with DEMO_MODE=true must override the default DEMO_LOGIN_PASSWORD.'
    );
  }
  return {
    ...result.data,
    DEMO_MODE: resolvedDemoMode
  };
}

export function getIntegrationReadiness(env: AppEnv): IntegrationReadiness {
  return {
    paypalEnvironment: env.PAYPAL_ENVIRONMENT,
    paypalConfigured: Boolean(env.PAYPAL_CLIENT_ID.trim() && env.PAYPAL_CLIENT_SECRET.trim()),
    paypalWebhookConfigured: Boolean(env.PAYPAL_WEBHOOK_ID.trim()),
    anthropicConfigured: Boolean(env.ANTHROPIC_API_KEY.trim()),
    anthropicModelConfigured: Boolean(env.ANTHROPIC_MODEL.trim()),
    storageDriver: env.STORAGE_DRIVER,
    demoMode: env.DEMO_MODE
  };
}

export function assertPayPalConfigured(env: AppEnv): {
  clientId: string;
  clientSecret: string;
  environment: 'sandbox';
  webhookId: string;
} {
  if (env.PAYPAL_ENVIRONMENT !== 'sandbox') {
    throw new ConfigurationError(
      'PAYPAL_SANDBOX_ONLY',
      'PROOFLINE only permits PAYPAL_ENVIRONMENT=sandbox in this release.'
    );
  }
  if (!env.PAYPAL_CLIENT_ID.trim() || !env.PAYPAL_CLIENT_SECRET.trim()) {
    throw new ConfigurationError(
      'PAYPAL_NOT_CONFIGURED',
      'PayPal Sandbox credentials are not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.'
    );
  }
  return {
    clientId: env.PAYPAL_CLIENT_ID.trim(),
    clientSecret: env.PAYPAL_CLIENT_SECRET.trim(),
    environment: 'sandbox',
    webhookId: env.PAYPAL_WEBHOOK_ID.trim()
  };
}

export function assertAnthropicConfigured(env: AppEnv): {
  apiKey: string;
  model: string;
} {
  if (!env.ANTHROPIC_API_KEY.trim()) {
    throw new ConfigurationError(
      'ANTHROPIC_NOT_CONFIGURED',
      'Anthropic API key is not configured. Set ANTHROPIC_API_KEY to run LLM-backed investigations.'
    );
  }
  if (!env.ANTHROPIC_MODEL.trim()) {
    throw new ConfigurationError(
      'ANTHROPIC_MODEL_NOT_CONFIGURED',
      'ANTHROPIC_MODEL is not configured. Specify a valid Anthropic model identifier via ANTHROPIC_MODEL.'
    );
  }
  return {
    apiKey: env.ANTHROPIC_API_KEY.trim(),
    model: env.ANTHROPIC_MODEL.trim()
  };
}

