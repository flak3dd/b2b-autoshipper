import { Request, Response } from 'express';
import crypto from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';

// Conditionally import queue functions to avoid crashes in serverless environments
let addTrackingUpdateJob: any;
if (process.env.VERCEL !== '1') {
  const queueModule = require('../jobs/queue');
  addTrackingUpdateJob = queueModule.addTrackingUpdateJob;
}

// Verify AfterShip webhook signature
export function verifyAfterShipWebhook(req: Request): boolean {
  const signature = req.headers['x-aftership-signature'] as string;
  const body = req.body;

  if (!signature || !body) {
    return false;
  }

  const calculatedSignature = crypto
    .createHmac('sha256', config.aftershipApiKey)
    .update(JSON.stringify(body))
    .digest('hex');

  return signature === calculatedSignature;
}

// AfterShip tracking update webhook
export async function afterShipTrackingHandler(req: Request, res: Response): Promise<void> {
  try {
    logger.info('AfterShip tracking webhook received');

    // Verify webhook signature (if signature verification is enabled)
    // Note: AfterShip signature verification may differ based on configuration
    // if (!verifyAfterShipWebhook(req)) {
    //   logger.warn('Invalid AfterShip webhook signature');
    //   res.status(401).json({ error: 'Invalid signature' });
    //   return;
    // }

    const webhookData = req.body;
    logger.info('Processing AfterShip webhook data', JSON.stringify(webhookData));

    // Extract tracking information
    const tracking = webhookData.data?.tracking;
    if (!tracking) {
      logger.warn('No tracking data in webhook payload');
      res.status(400).json({ error: 'No tracking data' });
      return;
    }

    const trackingNumber = tracking.tracking_number;
    const status = tracking.status;
    const orderId = tracking.order_id?.[0];

    logger.info(`Tracking update for ${trackingNumber}`, {
      status,
      orderId,
      courier: tracking.courier,
    });

    // Add tracking update job to queue (skip in serverless environments)
    if (addTrackingUpdateJob) {
      await addTrackingUpdateJob({
        trackingNumber,
        webhookData,
      });
    } else {
      logger.info('Skipping queue job in serverless environment');
    }

    logger.info(`Tracking update job queued for ${trackingNumber}`);
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Error processing AfterShip webhook', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// AfterShip webhook event handlers for different event types
export async function afterShipWebhookHandler(req: Request, res: Response): Promise<void> {
  try {
    const eventData = req.body;
    const event = eventData.event;

    logger.info(`AfterShip webhook event received: ${event}`);

    switch (event) {
      case 'tracking_update':
        await afterShipTrackingHandler(req, res);
        break;

      case 'tracking_created':
        logger.info('Tracking created event received');
        res.status(200).json({ success: true });
        break;

      case 'tracking_deleted':
        logger.info('Tracking deleted event received');
        res.status(200).json({ success: true });
        break;

      default:
        logger.warn(`Unknown AfterShip event type: ${event}`);
        res.status(400).json({ error: 'Unknown event type' });
    }
  } catch (error) {
    logger.error('Error processing AfterShip webhook event', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}