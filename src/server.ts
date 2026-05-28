import express from 'express';
import cron from 'node-cron';
// import { createBullBoard } from '@bull-board/express';
// import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { config, validateConfig } from './config';
import { logger } from './utils/logger';
import { initializeDatabase } from './db/connection';
import webhookRoutes from './routes/webhooks';

// Conditionally import queue-related modules to avoid crashes in serverless environments
let fulfillmentQueue: any, catalogSyncQueue: any, pricingSyncQueue: any, inventorySyncQueue: any;
let closeQueues: any;
let addCatalogSyncJob: any, addPricingSyncJob: any, addInventorySyncJob: any;

const isVercelEnvironment = process.env.VERCEL === '1';

if (!isVercelEnvironment) {
  const queueModule = require('./jobs/queue');
  fulfillmentQueue = queueModule.fulfillmentQueue;
  catalogSyncQueue = queueModule.catalogSyncQueue;
  pricingSyncQueue = queueModule.pricingSyncQueue;
  inventorySyncQueue = queueModule.inventorySyncQueue;
  closeQueues = queueModule.closeQueues;
  addCatalogSyncJob = queueModule.addCatalogSyncJob;
  addPricingSyncJob = queueModule.addPricingSyncJob;
  addInventorySyncJob = queueModule.addInventorySyncJob;
}

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// Routes
app.use('/webhooks', webhookRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'B2B AutoShipper',
    version: '1.0.0',
    status: 'running',
    environment: config.nodeEnv,
  });
});

// Bull Board dashboard for queue monitoring
// TODO: Fix Bull Board API integration for version 7.x
// const serverAdapter = new BullMQAdapter(fulfillmentQueue);
// createBullBoard({
//   queues: [
//     new BullMQAdapter(fulfillmentQueue),
//     new BullMQAdapter(catalogSyncQueue),
//     new BullMQAdapter(pricingSyncQueue),
//     new BullMQAdapter(inventorySyncQueue),
//   ],
//   serverAdapter,
// });

// app.use('/admin/queues', serverAdapter.getRouter());

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', err);
  res.status(500).json({
    error: 'Internal server error',
    message: config.nodeEnv === 'development' ? err.message : 'An error occurred',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Cron jobs
function setupCronJobs(): void {
  logger.info('Setting up cron jobs');

  // Catalog sync every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    logger.info('Running scheduled catalog sync');
    try {
      await addCatalogSyncJob({ force: false });
    } catch (error) {
      logger.error('Failed to schedule catalog sync', error);
    }
  });

  // Pricing sync every hour
  cron.schedule('0 * * * *', async () => {
    logger.info('Running scheduled pricing sync');
    try {
      await addPricingSyncJob({});
    } catch (error) {
      logger.error('Failed to schedule pricing sync', error);
    }
  });

  // Inventory sync every 2 hours
  cron.schedule('0 */2 * * *', async () => {
    logger.info('Running scheduled inventory sync');
    try {
      await addInventorySyncJob({});
    } catch (error) {
      logger.error('Failed to schedule inventory sync', error);
    }
  });

  logger.info('Cron jobs configured successfully');
}

// Initialize application
async function initialize(): Promise<void> {
  try {
    // Validate configuration
    validateConfig();

    // Skip database and queue initialization in serverless/Vercel environment
    if (!isVercelEnvironment) {
      // Initialize database
      logger.info('Initializing database connection');
      initializeDatabase();

      // Setup cron jobs
      setupCronJobs();
    } else {
      logger.info('Skipping database and queue initialization in Vercel environment');
    }

    logger.info('Application initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize application', error);
    if (!isVercelEnvironment) {
      process.exit(1);
    }
  }
}

// Start server
async function start(): Promise<void> {
  await initialize();

  const port = config.port;
  app.listen(port, () => {
    logger.info(`Server running on port ${port} in ${config.nodeEnv} mode`);
    logger.info(`Bull Board dashboard available at http://localhost:${port}/admin/queues`);
    logger.info(`Health check available at http://localhost:${port}/webhooks/health`);
  });
}

// Graceful shutdown
async function shutdown(): Promise<void> {
  logger.info('Shutting down gracefully...');

  try {
    // Close queues only if they were initialized
    if (closeQueues) {
      await closeQueues();
    }

    // Close database connection only if it was initialized
    if (!isVercelEnvironment) {
      const { closeDatabase } = require('./db/connection');
      await closeDatabase();
    }

    logger.info('Shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', error);
    process.exit(1);
  }
}

// Handle termination signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  shutdown();
});

// Start the server
if (require.main === module) {
  start();
}

export { app, initialize, shutdown };