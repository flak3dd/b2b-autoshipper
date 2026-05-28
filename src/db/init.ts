import { readFileSync } from 'fs';
import { join } from 'path';
import { query, initializeDatabase } from './connection';
import { logger } from '../utils/logger';

export async function initializeSchema(): Promise<void> {
  try {
    initializeDatabase();
    
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf8');
    
    logger.info('Initializing database schema...');
    await query(schema);
    logger.info('Database schema initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize database schema', error);
    throw error;
  }
}

// Run initialization if called directly
if (require.main === module) {
  initializeSchema()
    .then(() => {
      logger.info('Schema initialization completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Schema initialization failed', error);
      process.exit(1);
    });
}