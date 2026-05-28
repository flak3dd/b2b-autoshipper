import { Request, Response } from 'express';
import crypto from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';
import { addFulfillmentJob, addB2BCustomerJob } from '../jobs/queue';
import { query } from '../db/connection';

// Verify Shopify webhook signature
export function verifyShopifyWebhook(req: Request): boolean {
  const signature = req.headers['x-shopify-hmac-sha256'] as string;
  const body = req.body;

  if (!signature || !body) {
    return false;
  }

  const calculatedSignature = crypto
    .createHmac('sha256', config.shopifyWebhookSecret)
    .update(JSON.stringify(body))
    .digest('base64');

  return signature === calculatedSignature;
}

// Check if order is B2B
function isB2BOrder(order: any): boolean {
  const hasB2BTag = order.tags && order.tags.includes('B2B');
  const hasCompany = order.customer && order.customer.company;
  const hasSparkLayerMeta = order.note_attributes && 
    order.note_attributes.some((attr: any) => attr.name === 'sparklayer');
  const hasB2BCustomerEmail = order.customer && order.customer.email && 
    order.customer.email.includes('wholesale');
  
  return hasB2BTag || hasCompany || hasSparkLayerMeta || hasB2BCustomerEmail;
}

// Shopify order creation webhook
export async function shopifyOrderCreateHandler(req: Request, res: Response): Promise<void> {
  try {
    logger.info('Shopify order/create webhook received');

    // Verify webhook signature
    if (!verifyShopifyWebhook(req)) {
      logger.warn('Invalid Shopify webhook signature');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const order = req.body;
    logger.info(`Processing order ${order.id} for customer ${order.customer?.email}`);

    // Store order in database
    await query(
      `INSERT INTO order_mappings (shopify_order_id, fulfillment_status)
       VALUES ($1, $2)
       ON CONFLICT (shopify_order_id)
       DO UPDATE SET fulfillment_status = EXCLUDED.fulfillment_status, updated_at = NOW()`,
      [order.id, 'pending']
    );

    // Check if this is a B2B order
    if (isB2BOrder(order)) {
      logger.info(`Order ${order.id} identified as B2B order`);

      // Add fulfillment job to queue
      await addFulfillmentJob({
        orderId: order.id,
        order,
      });

      logger.info(`Fulfillment job queued for order ${order.id}`);
    } else {
      logger.info(`Order ${order.id} is not a B2B order, skipping automatic fulfillment`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Error processing Shopify order webhook', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Shopify order updated webhook
export async function shopifyOrderUpdateHandler(req: Request, res: Response): Promise<void> {
  try {
    logger.info('Shopify order/updated webhook received');

    // Verify webhook signature
    if (!verifyShopifyWebhook(req)) {
      logger.warn('Invalid Shopify webhook signature');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const order = req.body;
    logger.info(`Processing order update ${order.id}`);

    // Update order in database
    await query(
      `UPDATE order_mappings 
       SET fulfillment_status = $1, updated_at = NOW() 
       WHERE shopify_order_id = $2`,
      [order.financial_status === 'paid' ? 'processing' : 'pending', order.id]
    );

    // If order is now paid and is B2B, trigger fulfillment
    if (order.financial_status === 'paid' && isB2BOrder(order)) {
      logger.info(`Order ${order.id} is now paid and is B2B, triggering fulfillment`);

      await addFulfillmentJob({
        orderId: order.id,
        order,
      });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Error processing Shopify order update webhook', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Shopify customer creation webhook
export async function shopifyCustomerCreateHandler(req: Request, res: Response): Promise<void> {
  try {
    logger.info('Shopify customers/create webhook received');

    // Verify webhook signature
    if (!verifyShopifyWebhook(req)) {
      logger.warn('Invalid Shopify webhook signature');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const customer = req.body;
    logger.info(`Processing customer ${customer.id} (${customer.email})`);

    // Check if customer has B2B indicators
    const isB2BCustomer = customer.tags && customer.tags.includes('B2B');
    const hasCompany = customer.company;

    if (isB2BCustomer || hasCompany) {
      logger.info(`Customer ${customer.id} identified as B2B customer`);

      // Add B2B customer processing job to queue
      await addB2BCustomerJob({
        customerId: customer.id,
        customer,
      });

      logger.info(`B2B customer job queued for customer ${customer.id}`);
    } else {
      logger.info(`Customer ${customer.id} is not a B2B customer`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Error processing Shopify customer webhook', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Shopify customer update webhook
export async function shopifyCustomerUpdateHandler(req: Request, res: Response): Promise<void> {
  try {
    logger.info('Shopify customers/update webhook received');

    // Verify webhook signature
    if (!verifyShopifyWebhook(req)) {
      logger.warn('Invalid Shopify webhook signature');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const customer = req.body;
    logger.info(`Processing customer update ${customer.id}`);

    // Check if customer was updated to B2B status
    const isB2BCustomer = customer.tags && customer.tags.includes('B2B');
    const hasCompany = customer.company;

    if (isB2BCustomer || hasCompany) {
      logger.info(`Customer ${customer.id} updated to B2B status`);

      // Add B2B customer processing job to queue
      await addB2BCustomerJob({
        customerId: customer.id,
        customer,
      });

      logger.info(`B2B customer job queued for customer ${customer.id}`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Error processing Shopify customer update webhook', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Shopify product update webhook
export async function shopifyProductUpdateHandler(req: Request, res: Response): Promise<void> {
  try {
    logger.info('Shopify products/update webhook received');

    // Verify webhook signature
    if (!verifyShopifyWebhook(req)) {
      logger.warn('Invalid Shopify webhook signature');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const product = req.body;
    logger.info(`Processing product update ${product.id}`);

    // Update product in database
    const variant = product.variants && product.variants[0];
    if (variant) {
      await query(
        `UPDATE products 
         SET title = $1, 
             retail_price = $2, 
             inventory_count = $3,
             last_synced = NOW()
         WHERE shopify_id = $4`,
        [
          product.title,
          variant.price,
          variant.inventory_quantity || 0,
          product.id,
        ]
      );

      logger.info(`Product ${product.id} updated in database`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Error processing Shopify product webhook', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}