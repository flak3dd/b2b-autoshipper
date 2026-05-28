import axios from 'axios';
import { config } from '../config';
import { logger } from './logger';

interface SlackAlert {
  text: string;
  color?: 'good' | 'warning' | 'danger';
  fields?: Array<{
    title: string;
    value: string;
    short: boolean;
  }>;
}

export class MonitoringService {
  private slackWebhookUrl?: string;

  constructor() {
    this.slackWebhookUrl = config.slackWebhookUrl;
  }

  async sendSlackAlert(alert: SlackAlert): Promise<void> {
    if (!this.slackWebhookUrl) {
      logger.debug('Slack webhook URL not configured, skipping alert');
      return;
    }

    try {
      const payload = {
        attachments: [
          {
            text: alert.text,
            color: alert.color || 'warning',
            fields: alert.fields || [],
            ts: Math.floor(Date.now() / 1000),
          },
        ],
      };

      await axios.post(this.slackWebhookUrl, payload);
      logger.info('Slack alert sent successfully');
    } catch (error) {
      logger.error('Failed to send Slack alert', error);
    }
  }

  async alertError(error: Error, context?: any): Promise<void> {
    await this.sendSlackAlert({
      text: `Error in B2B AutoShipper: ${error.message}`,
      color: 'danger',
      fields: [
        {
          title: 'Error Type',
          value: error.name,
          short: true,
        },
        {
          title: 'Environment',
          value: config.nodeEnv,
          short: true,
        },
        ...(context
          ? [
              {
                title: 'Context',
                value: JSON.stringify(context, null, 2),
                short: false,
              },
            ]
          : []),
      ],
    });
  }

  async alertOrderFulfillment(orderId: string, status: string, details?: any): Promise<void> {
    const color = status === 'success' ? 'good' : status === 'failed' ? 'danger' : 'warning';

    await this.sendSlackAlert({
      text: `Order fulfillment ${status}: ${orderId}`,
      color,
      fields: [
        {
          title: 'Order ID',
          value: orderId,
          short: true,
        },
        {
          title: 'Status',
          value: status,
          short: true,
        },
        ...(details
          ? [
              {
                title: 'Details',
                value: JSON.stringify(details, null, 2),
                short: false,
              },
            ]
          : []),
      ],
    });
  }

  async alertSyncFailure(type: string, error: string): Promise<void> {
    await this.sendSlackAlert({
      text: `Sync failure: ${type}`,
      color: 'danger',
      fields: [
        {
          title: 'Sync Type',
          value: type,
          short: true,
        },
        {
          title: 'Error',
          value: error,
          short: false,
        },
      ],
    });
  }

  async alertLowStock(productId: string, stockLevel: number): Promise<void> {
    await this.sendSlackAlert({
      text: `Low stock alert: ${productId}`,
      color: 'warning',
      fields: [
        {
          title: 'Product ID',
          value: productId,
          short: true,
        },
        {
          title: 'Stock Level',
          value: stockLevel.toString(),
          short: true,
        },
      ],
    });
  }

  async alertSystemHealth(healthStatus: string, metrics?: any): Promise<void> {
    const color = healthStatus === 'healthy' ? 'good' : healthStatus === 'degraded' ? 'warning' : 'danger';

    await this.sendSlackAlert({
      text: `System health status: ${healthStatus}`,
      color,
      fields: [
        {
          title: 'Status',
          value: healthStatus,
          short: true,
        },
        {
          title: 'Environment',
          value: config.nodeEnv,
          short: true,
        },
        ...(metrics
          ? [
              {
                title: 'Metrics',
                value: JSON.stringify(metrics, null, 2),
                short: false,
              },
            ]
          : []),
      ],
    });
  }
}

export const monitoringService = new MonitoringService();

// Sentry integration (optional)
export function initSentry(): void {
  if (!config.sentryDsn) {
    logger.debug('Sentry DSN not configured, skipping initialization');
    return;
  }

  try {
    // Note: You would need to install @sentry/node
    // import * as Sentry from '@sentry/node';
    // Sentry.init({
    //   dsn: config.sentryDsn,
    //   environment: config.nodeEnv,
    //   tracesSampleRate: 1.0,
    // });

    logger.info('Sentry initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Sentry', error);
  }
}

// Health check function
export async function performHealthCheck(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: any;
}> {
  const checks: any = {
    database: false,
    redis: false,
    queues: false,
  };

  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  try {
    // Check database connection
    const { query } = require('./db/connection');
    await query('SELECT 1');
    checks.database = true;
  } catch (error) {
    logger.error('Database health check failed', error);
    checks.database = false;
    overallStatus = 'unhealthy';
  }

  try {
    // Check Redis connection
    const Redis = require('ioredis');
    const redis = new Redis({
      host: config.redisHost,
      port: config.redisPort,
      password: config.redisPassword,
    });
    await redis.ping();
    await redis.quit();
    checks.redis = true;
  } catch (error) {
    logger.error('Redis health check failed', error);
    checks.redis = false;
    overallStatus = 'degraded';
  }

  try {
    // Check queue status
    const { fulfillmentQueue } = require('./jobs/queue');
    const jobCounts = await fulfillmentQueue.getJobCounts();
    checks.queues = {
      fulfillment: jobCounts,
      active: jobCounts.active > 0,
    };
  } catch (error) {
    logger.error('Queue health check failed', error);
    checks.queues = false;
    overallStatus = 'degraded';
  }

  return {
    status: overallStatus,
    checks,
  };
}