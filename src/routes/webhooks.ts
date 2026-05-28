import { Router } from 'express';
import {
  shopifyOrderCreateHandler,
  shopifyOrderUpdateHandler,
  shopifyCustomerCreateHandler,
  shopifyCustomerUpdateHandler,
  shopifyProductUpdateHandler,
} from '../webhooks/shopifyWebhook';
import {
  afterShipTrackingHandler,
  afterShipWebhookHandler,
} from '../webhooks/afterShipWebhook';
import { logger } from '../utils/logger';

const router = Router();

// Shopify webhooks
router.post('/shopify/orders/create', async (req, res) => {
  await shopifyOrderCreateHandler(req, res);
});

router.post('/shopify/orders/updated', async (req, res) => {
  await shopifyOrderUpdateHandler(req, res);
});

router.post('/shopify/customers/create', async (req, res) => {
  await shopifyCustomerCreateHandler(req, res);
});

router.post('/shopify/customers/update', async (req, res) => {
  await shopifyCustomerUpdateHandler(req, res);
});

router.post('/shopify/products/update', async (req, res) => {
  await shopifyProductUpdateHandler(req, res);
});

// AfterShip webhooks
router.post('/aftership/tracking', async (req, res) => {
  await afterShipTrackingHandler(req, res);
});

router.post('/aftership', async (req, res) => {
  await afterShipWebhookHandler(req, res);
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Webhook test endpoint (for development)
router.post('/test/shopify/order', async (req, res) => {
  try {
    logger.info('Test Shopify order webhook received');
    await shopifyOrderCreateHandler(req, res);
  } catch (error) {
    logger.error('Error in test Shopify order webhook', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;