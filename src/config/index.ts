import dotenv from 'dotenv';

dotenv.config();

interface Config {
  // Server
  port: number;
  nodeEnv: string;

  // Database
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  dbConnectionString?: string; // For Supabase
  useSupabase: boolean;

  // Supabase
  supabaseUrl?: string;
  supabaseKey?: string;

  // Redis
  redisHost: string;
  redisPort: number;
  redisPassword?: string;

  // Shopify
  shopifyShopUrl: string;
  shopifyApiKey: string;
  shopifyApiSecret: string;
  shopifyWebhookSecret: string;

  // SparkLayer
  sparklayerSiteId: string;
  sparklayerApiKey: string;
  sparklayerApiSecret: string;

  // AutoDS
  autodsApiKey: string;
  autodsApiSecret: string;

  // Syncee
  synceeApiKey: string;
  synceeApiSecret: string;

  // AfterShip
  aftershipApiKey: string;

  // Monitoring
  sentryDsn?: string;
  slackWebhookUrl?: string;
}

function getRequiredEnvVar(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getOptionalEnvVar(key: string, defaultValue: string = ''): string {
  return process.env[key] || defaultValue;
}

function getNumberEnvVar(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}

export const config: Config = {
  // Server
  port: getNumberEnvVar('PORT', 3000),
  nodeEnv: getOptionalEnvVar('NODE_ENV', 'development'),

  // Database
  dbHost: getOptionalEnvVar('DB_HOST', 'localhost'),
  dbPort: getNumberEnvVar('DB_PORT', 5432),
  dbName: getRequiredEnvVar('DB_NAME'),
  dbUser: getRequiredEnvVar('DB_USER'),
  dbPassword: getRequiredEnvVar('DB_PASSWORD'),
  dbConnectionString: getOptionalEnvVar('DATABASE_CONNECTION_STRING'),
  useSupabase: getOptionalEnvVar('USE_SUPABASE', 'false') === 'true',

  // Supabase
  supabaseUrl: getOptionalEnvVar('SUPABASE_URL'),
  supabaseKey: getOptionalEnvVar('SUPABASE_KEY'),

  // Redis
  redisHost: getOptionalEnvVar('REDIS_HOST', 'localhost'),
  redisPort: getNumberEnvVar('REDIS_PORT', 6379),
  redisPassword: getOptionalEnvVar('REDIS_PASSWORD'),

  // Shopify
  shopifyShopUrl: getRequiredEnvVar('SHOPIFY_SHOP_URL'),
  shopifyApiKey: getRequiredEnvVar('SHOPIFY_API_KEY'),
  shopifyApiSecret: getRequiredEnvVar('SHOPIFY_API_SECRET'),
  shopifyWebhookSecret: getRequiredEnvVar('SHOPIFY_WEBHOOK_SECRET'),

  // SparkLayer
  sparklayerSiteId: getRequiredEnvVar('SPARKLAYER_SITE_ID'),
  sparklayerApiKey: getRequiredEnvVar('SPARKLAYER_API_KEY'),
  sparklayerApiSecret: getRequiredEnvVar('SPARKLAYER_API_SECRET'),

  // AutoDS
  autodsApiKey: getRequiredEnvVar('AUTODS_API_KEY'),
  autodsApiSecret: getRequiredEnvVar('AUTODS_API_SECRET'),

  // Syncee
  synceeApiKey: getRequiredEnvVar('SYNCEE_API_KEY'),
  synceeApiSecret: getRequiredEnvVar('SYNCEE_API_SECRET'),

  // AfterShip
  aftershipApiKey: getRequiredEnvVar('AFTERSHIP_API_KEY'),

  // Monitoring
  sentryDsn: getOptionalEnvVar('SENTRY_DSN'),
  slackWebhookUrl: getOptionalEnvVar('SLACK_WEBHOOK_URL'),
};

// Validate configuration on startup
export function validateConfig(): void {
  // This will throw if any required env vars are missing
  JSON.stringify(config);
}