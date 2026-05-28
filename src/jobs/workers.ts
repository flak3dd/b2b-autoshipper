import { Worker, Job } from 'bullmq';
import { logger } from '../utils/logger';
import { 
  fulfillmentQueue, 
  catalogSyncQueue, 
  pricingSyncQueue, 
  inventorySyncQueue, 
  b2bCustomerQueue, 
  trackingUpdateQueue,
  QUEUE_NAMES,
  FulfillmentJobData,
  CatalogSyncJobData,
  PricingSyncJobData,
  InventorySyncJobData,
  B2BCustomerJobData,
  TrackingUpdateJobData,
  queueOptions
} from './queue';
import { autoDSService } from '../services/autoDSService';
import { synceeService } from '../services/synceeService';
import { sparkLayerService } from '../services/sparkLayerService';
import { afterShipService } from '../services/afterShipService';
import { routingEngine } from '../services/routingEngine';
import { query } from '../db/connection';

// Fulfillment worker
export const fulfillmentWorker = new Worker(
  QUEUE_NAMES.FULFILLMENT,
  async (job: Job<FulfillmentJobData>) => {
    logger.info(`Processing fulfillment job for order ${job.data.orderId}`);
    
    try {
      const { orderId, order } = job.data;
      
      // Check if this is a B2B order
      if (!isB2BOrder(order)) {
        logger.info(`Order ${orderId} is not a B2B order, skipping fulfillment`);
        return { success: true, message: 'Not a B2B order' };
      }

      // Select best supplier
      const supplier = await routingEngine.selectSupplier(order);
      logger.info(`Selected supplier ${supplier} for order ${orderId}`);

      // Check if order needs to be split across multiple suppliers
      const splitOrder = await routingEngine.splitOrderBySupplier(order);
      
      if (splitOrder.size > 1) {
        logger.info(`Order ${orderId} will be split across ${splitOrder.size} suppliers`);
        
        // Process each supplier separately
        const results = [];
        for (const [supplierName, lineItems] of splitOrder.entries()) {
          const splitOrderData = {
            ...order,
            line_items: lineItems,
          };
          
          const result = await autoDSService.fulfillOrder(splitOrderData, supplierName);
          results.push(result);
        }
        
        return { success: true, split: true, results };
      } else {
        // Single supplier fulfillment
        const result = await autoDSService.fulfillOrder(order, supplier);
        
        // Create tracking in AfterShip if tracking number is available
        if (result.trackingNumber) {
          await afterShipService.createTrackingFromOrder(
            orderId,
            result.trackingNumber,
            'dhl', // Default courier - should be determined from supplier response
            order.customer
          );
        }
        
        return { success: true, result };
      }
    } catch (error) {
      logger.error(`Fulfillment job failed for order ${job.data.orderId}`, error);
      throw error;
    }
  },
  queueOptions
);

// Catalog sync worker
export const catalogSyncWorker = new Worker(
  QUEUE_NAMES.CATALOG_SYNC,
  async (job: Job<CatalogSyncJobData>) => {
    logger.info('Processing catalog sync job');
    
    try {
      const result = await synceeService.syncCatalog();
      logger.info('Catalog sync completed', result);
      return result;
    } catch (error) {
      logger.error('Catalog sync job failed', error);
      throw error;
    }
  },
  queueOptions
);

// Pricing sync worker
export const pricingSyncWorker = new Worker(
  QUEUE_NAMES.PRICING_SYNC,
  async (job: Job<PricingSyncJobData>) => {
    logger.info('Processing pricing sync job');
    
    try {
      const result = await sparkLayerService.syncProductPricing();
      logger.info('Pricing sync completed', result);
      return result;
    } catch (error) {
      logger.error('Pricing sync job failed', error);
      throw error;
    }
  },
  queueOptions
);

// Inventory sync worker
export const inventorySyncWorker = new Worker(
  QUEUE_NAMES.INVENTORY_SYNC,
  async (job: Job<InventorySyncJobData>) => {
    logger.info('Processing inventory sync job');
    
    try {
      const result = await autoDSService.syncInventory();
      logger.info('Inventory sync completed', result);
      return result;
    } catch (error) {
      logger.error('Inventory sync job failed', error);
      throw error;
    }
  },
  queueOptions
);

// B2B customer worker
export const b2bCustomerWorker = new Worker(
  QUEUE_NAMES.B2B_CUSTOMER,
  async (job: Job<B2BCustomerJobData>) => {
    logger.info(`Processing B2B customer job for customer ${job.data.customerId}`);
    
    try {
      const { customer } = job.data;
      await sparkLayerService.handleNewB2BCustomer(customer);
      logger.info(`B2B customer ${job.data.customerId} processed successfully`);
      return { success: true };
    } catch (error) {
      logger.error(`B2B customer job failed for customer ${job.data.customerId}`, error);
      throw error;
    }
  },
  queueOptions
);

// Tracking update worker
export const trackingUpdateWorker = new Worker(
  QUEUE_NAMES.TRACKING_UPDATE,
  async (job: Job<TrackingUpdateJobData>) => {
    logger.info(`Processing tracking update job for ${job.data.trackingNumber}`);
    
    try {
      await afterShipService.handleTrackingUpdate(job.data.webhookData);
      logger.info(`Tracking update processed for ${job.data.trackingNumber}`);
      return { success: true };
    } catch (error) {
      logger.error(`Tracking update job failed for ${job.data.trackingNumber}`, error);
      throw error;
    }
  },
  queueOptions
);

// Helper function to check if order is B2B
function isB2BOrder(order: any): boolean {
  // Check for B2B indicators
  const hasB2BTag = order.tags && order.tags.includes('B2B');
  const hasCompany = order.customer && order.customer.company;
  const hasSparkLayerMeta = order.note_attributes && 
    order.note_attributes.some((attr: any) => attr.name === 'sparklayer');
  
  return hasB2BTag || hasCompany || hasSparkLayerMeta;
}

// Worker event handlers
function setupWorkerHandlers(worker: Worker, workerName: string): void {
  worker.on('completed', (job: Job) => {
    logger.info(`${workerName} completed job ${job.id}`);
  });

  worker.on('failed', (job: Job | undefined, error: Error) => {
    logger.error(`${workerName} failed job ${job?.id}`, error);
  });

  worker.on('error', (error: Error) => {
    logger.error(`${workerName} error`, error);
  });
}

// Setup handlers for all workers
setupWorkerHandlers(fulfillmentWorker, 'FulfillmentWorker');
setupWorkerHandlers(catalogSyncWorker, 'CatalogSyncWorker');
setupWorkerHandlers(pricingSyncWorker, 'PricingSyncWorker');
setupWorkerHandlers(inventorySyncWorker, 'InventorySyncWorker');
setupWorkerHandlers(b2bCustomerWorker, 'B2BCustomerWorker');
setupWorkerHandlers(trackingUpdateWorker, 'TrackingUpdateWorker');

// Graceful shutdown
async function closeWorkers(): Promise<void> {
  logger.info('Closing workers...');
  await Promise.all([
    fulfillmentWorker.close(),
    catalogSyncWorker.close(),
    pricingSyncWorker.close(),
    inventorySyncWorker.close(),
    b2bCustomerWorker.close(),
    trackingUpdateWorker.close(),
  ]);
  logger.info('All workers closed');
}

// Handle process termination
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing workers...');
  await closeWorkers();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing workers...');
  await closeWorkers();
  process.exit(0);
});

export { closeWorkers };