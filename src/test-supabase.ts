import { config, validateConfig } from './config';
import { initializeDatabase, query, getSupabase } from './db/connection';
import { logger } from './utils/logger';

async function testSupabaseConnection(): Promise<void> {
  try {
    logger.info('Testing Supabase configuration...');

    // Validate configuration
    validateConfig();

    if (!config.useSupabase) {
      logger.info('USE_SUPABASE is false. To test Supabase, set USE_SUPABASE=true in .env');
      return;
    }

    if (!config.supabaseUrl || !config.supabaseKey) {
      throw new Error('SUPABASE_URL and SUPABASE_KEY are required when USE_SUPABASE=true');
    }

    logger.info('Configuration validated successfully');
    logger.info(`Supabase URL: ${config.supabaseUrl}`);
    logger.info(`Database Connection String: ${config.dbConnectionString ? 'Set' : 'Not set'}`);

    // Initialize database connection
    logger.info('Initializing database connection...');
    initializeDatabase();

    // Test simple query
    logger.info('Testing database query...');
    const result = await query('SELECT NOW() as current_time');
    logger.info('Query successful:', result.rows[0]);

    // Test Supabase client
    logger.info('Testing Supabase client...');
    const supabase = getSupabase();
    logger.info('Supabase client initialized successfully');

    // Test table existence
    logger.info('Testing table access...');
    const tables = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    logger.info(`Found ${tables.rows.length} tables:`, tables.rows.map(r => r.table_name));

    // Test if our tables exist
    const requiredTables = ['suppliers', 'products', 'b2b_customers', 'order_mappings', 'sync_logs'];
    const existingTables = tables.rows.map(r => r.table_name);
    const missingTables = requiredTables.filter(table => !existingTables.includes(table));

    if (missingTables.length > 0) {
      logger.warn(`Missing tables: ${missingTables.join(', ')}`);
      logger.info('Please run the Supabase migration to create the schema');
    } else {
      logger.info('All required tables exist');
    }

    logger.info('✅ Supabase connection test completed successfully');
  } catch (error) {
    logger.error('❌ Supabase connection test failed', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testSupabaseConnection()
    .then(() => {
      logger.info('Test completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Test failed', error);
      process.exit(1);
    });
}

export { testSupabaseConnection };