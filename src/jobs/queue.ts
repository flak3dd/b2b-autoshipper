import { Queue, Worker, Job, QueueOptions } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';

const connection = new Redis({
  host: config.redisHost,
  port: config.redisPort,
  password: config.redisPassword,
  maxRetriesPerRequest: null,
});

export const queueOptions: QueueOptions = {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      count: 1000,
      age: 3600, // 1 hour
    },
    removeOnFail: {
      count: 5000,
      age: 86400, // 24 hours
    },
  },
};

// Define queue names
export const QUEUE_NAMES = {
  FULFILLMENT: 'fulfillment',
  CATALOG_SYNC: 'catalog-sync',
  PRICING_SYNC: 'pricing-sync',
  INVENTORY_SYNC: 'inventory-sync',
  B2B_CUSTOMER: 'b2b-customer',
  TRACKING_UPDATE: 'tracking-update',
  AI_PRODUCT_ANALYSIS: 'ai-product-analysis',
  AI_BATCH_ANALYSIS: 'ai-batch-analysis',
  AI_COMPETITOR_MONITOR: 'ai-competitor-monitor',
  AI_OPPORTUNITY_SCAN: 'ai-opportunity-scan',
  AI_PRICING_OPTIMIZATION: 'ai-pricing-optimization',
  AI_SUPPLIER_SCORING: 'ai-supplier-scoring',
  AI_DEMAND_FORECAST: 'ai-demand-forecast',
  AI_CALIBRATION: 'ai-calibration',
  AI_MARKET_INTELLIGENCE: 'ai-market-intelligence',
} as const;

// Create queues
export const fulfillmentQueue = new Queue(QUEUE_NAMES.FULFILLMENT, queueOptions);
export const catalogSyncQueue = new Queue(QUEUE_NAMES.CATALOG_SYNC, queueOptions);
export const pricingSyncQueue = new Queue(QUEUE_NAMES.PRICING_SYNC, queueOptions);
export const inventorySyncQueue = new Queue(QUEUE_NAMES.INVENTORY_SYNC, queueOptions);
export const b2bCustomerQueue = new Queue(QUEUE_NAMES.B2B_CUSTOMER, queueOptions);
export const trackingUpdateQueue = new Queue(QUEUE_NAMES.TRACKING_UPDATE, queueOptions);

// AI queues
export const aiProductAnalysisQueue = new Queue(QUEUE_NAMES.AI_PRODUCT_ANALYSIS, queueOptions);
export const aiBatchAnalysisQueue = new Queue(QUEUE_NAMES.AI_BATCH_ANALYSIS, queueOptions);
export const aiCompetitorMonitorQueue = new Queue(QUEUE_NAMES.AI_COMPETITOR_MONITOR, queueOptions);
export const aiOpportunityScanQueue = new Queue(QUEUE_NAMES.AI_OPPORTUNITY_SCAN, queueOptions);
export const aiPricingOptimizationQueue = new Queue(QUEUE_NAMES.AI_PRICING_OPTIMIZATION, queueOptions);
export const aiSupplierScoringQueue = new Queue(QUEUE_NAMES.AI_SUPPLIER_SCORING, queueOptions);
export const aiDemandForecastQueue = new Queue(QUEUE_NAMES.AI_DEMAND_FORECAST, queueOptions);
export const aiCalibrationQueue = new Queue(QUEUE_NAMES.AI_CALIBRATION, queueOptions);
export const aiMarketIntelligenceQueue = new Queue(QUEUE_NAMES.AI_MARKET_INTELLIGENCE, queueOptions);

// Job data types
export interface FulfillmentJobData {
  orderId: string;
  order: any;
}

export interface CatalogSyncJobData {
  force?: boolean;
}

export interface PricingSyncJobData {
  productIds?: string[];
}

export interface InventorySyncJobData {
  supplierId?: number;
}

export interface B2BCustomerJobData {
  customerId: string;
  customer: any;
}

export interface TrackingUpdateJobData {
  trackingNumber: string;
  webhookData: any;
}

// Helper functions to add jobs
export async function addFulfillmentJob(data: FulfillmentJobData, options?: any): Promise<Job> {
  return await fulfillmentQueue.add('fulfill-order', data, {
    priority: 10, // High priority for orders
    ...options,
  });
}

export async function addCatalogSyncJob(data: CatalogSyncJobData = {}): Promise<Job> {
  return await catalogSyncQueue.add('sync-catalog', data, {
    priority: 5, // Medium priority
  });
}

export async function addPricingSyncJob(data: PricingSyncJobData = {}): Promise<Job> {
  return await pricingSyncQueue.add('sync-pricing', data, {
    priority: 3, // Lower priority
  });
}

export async function addInventorySyncJob(data: InventorySyncJobData = {}): Promise<Job> {
  return await inventorySyncQueue.add('sync-inventory', data, {
    priority: 3, // Lower priority
  });
}

export async function addB2BCustomerJob(data: B2BCustomerJobData): Promise<Job> {
  return await b2bCustomerQueue.add('process-b2b-customer', data, {
    priority: 8, // High priority for customers
  });
}

export async function addTrackingUpdateJob(data: TrackingUpdateJobData): Promise<Job> {
  return await trackingUpdateQueue.add('update-tracking', data, {
    priority: 6, // Medium-high priority
  });
}

// AI job helper functions
export async function addAIProductAnalysisJob(productId: string): Promise<Job> {
  return await aiProductAnalysisQueue.add('analyze-product', { productId }, {
    priority: 7, // High priority for AI analysis
  });
}

export async function addAIBatchAnalysisJob(productIds: string[]): Promise<Job> {
  return await aiBatchAnalysisQueue.add('batch-analyze', { productIds }, {
    priority: 6, // Medium-high priority
  });
}

export async function addAICompetitorMonitorJob(): Promise<Job> {
  return await aiCompetitorMonitorQueue.add('monitor-competitors', {}, {
    priority: 4, // Medium priority
  });
}

export async function addAIOpportunityScanJob(): Promise<Job> {
  return await aiOpportunityScanQueue.add('scan-opportunities', {}, {
    priority: 5, // Medium priority
  });
}

export async function addAIPricingOptimizationJob(productId?: string): Promise<Job> {
  return await aiPricingOptimizationQueue.add('optimize-pricing', { productId }, {
    priority: 6, // Medium-high priority
  });
}

export async function addAISupplierScoringJob(supplierId?: number): Promise<Job> {
  return await aiSupplierScoringQueue.add('score-supplier', { supplierId }, {
    priority: 4, // Medium priority
  });
}

export async function addAIDemandForecastJob(productId: string, period?: string): Promise<Job> {
  return await aiDemandForecastQueue.add('forecast-demand', { productId, period }, {
    priority: 5, // Medium priority
  });
}

export async function addAICalibrationJob(): Promise<Job> {
  return await aiCalibrationQueue.add('calibrate-models', {}, {
    priority: 2, // Low priority - maintenance
  });
}

export async function addAIMarketIntelligenceJob(): Promise<Job> {
  return await aiMarketIntelligenceQueue.add('update-intelligence', {}, {
    priority: 3, // Low-medium priority
  });
}

// Close all queues
export async function closeQueues(): Promise<void> {
  await Promise.all([
    fulfillmentQueue.close(),
    catalogSyncQueue.close(),
    pricingSyncQueue.close(),
    inventorySyncQueue.close(),
    b2bCustomerQueue.close(),
    trackingUpdateQueue.close(),
    aiProductAnalysisQueue.close(),
    aiBatchAnalysisQueue.close(),
    aiCompetitorMonitorQueue.close(),
    aiOpportunityScanQueue.close(),
    aiPricingOptimizationQueue.close(),
    aiSupplierScoringQueue.close(),
    aiDemandForecastQueue.close(),
    aiCalibrationQueue.close(),
    aiMarketIntelligenceQueue.close(),
  ]);
  
  await connection.quit();
  logger.info('All queues closed');
}