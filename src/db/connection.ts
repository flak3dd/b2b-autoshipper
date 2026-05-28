import { Pool, PoolClient, QueryResult } from 'pg';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';

let pool: Pool;
let supabase: SupabaseClient;

export function initializeDatabase(): Pool {
  if (pool) {
    return pool;
  }

  // For Supabase, use the connection string; for standard PostgreSQL, build from components
  let connectionString: string;

  if (config.useSupabase) {
    if (!config.dbConnectionString) {
      throw new Error('DATABASE_CONNECTION_STRING is required when using Supabase');
    }
    connectionString = config.dbConnectionString;
    logger.info('Using Supabase database connection');
  } else {
    // Build connection string from individual components for standard PostgreSQL
    connectionString = `postgresql://${config.dbUser}:${config.dbPassword}@${config.dbHost}:${config.dbPort}/${config.dbName}`;
    logger.info('Using standard PostgreSQL connection');
  }

  pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  pool.on('error', (err: Error) => {
    logger.error('Unexpected error on idle client', err);
    process.exit(-1);
  });

  logger.info('Database connection pool initialized');
  return pool;
}

export function getPool(): Pool {
  if (!pool) {
    pool = initializeDatabase();
  }
  return pool;
}

// Get Supabase client for additional Supabase-specific features
export function getSupabase(): SupabaseClient {
  if (!config.useSupabase) {
    throw new Error('Supabase client is only available when USE_SUPABASE=true');
  }
  
  if (!supabase) {
    if (!config.supabaseUrl || !config.supabaseKey) {
      throw new Error('SUPABASE_URL and SUPABASE_KEY are required when using Supabase client');
    }

    supabase = createClient(config.supabaseUrl, config.supabaseKey, {
      auth: {
        persistSession: false,
      },
    });

    logger.info('Supabase client initialized');
  }
  
  return supabase;
}

// Standard query function (works with both PostgreSQL and Supabase via connection string)
export async function query(text: string, params?: any[]): Promise<QueryResult> {
  const start = Date.now();
  try {
    const res = await getPool().query(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    logger.error('Database query error', { text, error });
    throw error;
  }
}

export async function getClient(): Promise<PoolClient> {
  const client = await getPool().connect();
  return client;
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    logger.info('Database connection closed');
  }
  // Supabase client doesn't need explicit closing
}