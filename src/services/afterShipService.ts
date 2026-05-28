import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';
import { FulfillmentError } from '../utils/errors';
import { query } from '../db/connection';

interface TrackingInfo {
  trackingNumber: string;
  courier: string;
  title?: string;
  customerName?: string;
  customerEmail?: string;
  orderIds?: string[];
}

interface AfterShipTracking {
  id: string;
  tracking_number: string;
  courier: string;
  status: string;
  checkpoint_status: string;
  tracking_url: string;
  estimated_delivery: string;
}

class AfterShipService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.aftership.com/v4',
      headers: {
        'aftership-api-key': config.aftershipApiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    this.client.interceptors.request.use((request) => {
      logger.debug('AfterShip API request', { method: request.method, url: request.url });
      return request;
    });

    this.client.interceptors.response.use(
      (response) => {
        logger.debug('AfterShip API response', { status: response.status, url: response.config.url });
        return response;
      },
      (error) => {
        logger.error('AfterShip API error', {
          status: error.response?.status,
          url: error.config?.url,
          message: error.message,
        });
        throw error;
      }
    );
  }

  async createTracking(trackingInfo: TrackingInfo): Promise<AfterShipTracking> {
    try {
      const response = await this.client.post('/trackings', {
        tracking: {
          tracking_number: trackingInfo.trackingNumber,
          courier: trackingInfo.courier,
          title: trackingInfo.title,
          customer_name: trackingInfo.customerName,
          customer_email: trackingInfo.customerEmail,
          order_ids: trackingInfo.orderIds,
        },
      });

      const tracking = response.data.data.tracking;
      logger.info(`AfterShip tracking created for ${trackingInfo.trackingNumber}`, {
        trackingId: tracking.id,
        courier: tracking.courier,
      });

      return tracking;
    } catch (error) {
      throw new FulfillmentError(`Failed to create AfterShip tracking for ${trackingInfo.trackingNumber}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        trackingNumber: trackingInfo.trackingNumber,
      });
    }
  }

  async getTracking(trackingNumber: string): Promise<AfterShipTracking> {
    try {
      const response = await this.client.get(`/trackings/${trackingNumber}`);
      return response.data.data.tracking;
    } catch (error) {
      throw new FulfillmentError(`Failed to get AfterShip tracking for ${trackingNumber}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async updateTracking(trackingNumber: string, updates: Partial<TrackingInfo>): Promise<void> {
    try {
      await this.client.put(`/trackings/${trackingNumber}`, {
        tracking: updates,
      });

      logger.info(`AfterShip tracking updated for ${trackingNumber}`);
    } catch (error) {
      throw new FulfillmentError(`Failed to update AfterShip tracking for ${trackingNumber}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async deleteTracking(trackingNumber: string): Promise<void> {
    try {
      await this.client.delete(`/trackings/${trackingNumber}`);
      logger.info(`AfterShip tracking deleted for ${trackingNumber}`);
    } catch (error) {
      logger.error(`Failed to delete AfterShip tracking for ${trackingNumber}`, error);
      throw error;
    }
  }

  async handleTrackingUpdate(webhookData: any): Promise<void> {
    try {
      const tracking = webhookData.data?.tracking;
      if (!tracking) {
        logger.warn('Invalid tracking webhook data', { webhookData });
        return;
      }

      const trackingNumber = tracking.tracking_number;
      const status = tracking.status;
      const trackingUrl = tracking.tracking_url;

      // Update order mappings with tracking info
      await query(
        `UPDATE order_mappings 
         SET tracking_number = $1, 
             tracking_url = $2,
             fulfillment_status = $3,
             updated_at = NOW()
         WHERE supplier_order_id = $4`,
        [trackingNumber, trackingUrl, this.mapFulfillmentStatus(status), tracking.order_id?.[0]]
      );

      logger.info(`Tracking update processed for ${trackingNumber}`, {
        status,
        trackingUrl,
      });
    } catch (error) {
      logger.error('Failed to process tracking webhook', error);
      throw error;
    }
  }

  private mapFulfillmentStatus(aftershipStatus: string): string {
    const statusMap: { [key: string]: string } = {
      'pending': 'pending',
      'in_transit': 'in_transit',
      'out_for_delivery': 'out_for_delivery',
      'delivered': 'delivered',
      'exception': 'exception',
      'failed_attempt': 'exception',
      'expired': 'cancelled',
    };

    return statusMap[aftershipStatus] || 'unknown';
  }

  async createTrackingFromOrder(shopifyOrderId: string, trackingNumber: string, courier: string, customerInfo?: any): Promise<void> {
    try {
      const trackingInfo: TrackingInfo = {
        trackingNumber,
        courier,
        title: `Order ${shopifyOrderId}`,
        orderIds: [shopifyOrderId],
        ...(customerInfo && {
          customerName: customerInfo.name,
          customerEmail: customerInfo.email,
        }),
      };

      const tracking = await this.createTracking(trackingInfo);

      // Update order mapping with tracking info
      await query(
        `UPDATE order_mappings 
         SET tracking_number = $1, 
             tracking_url = $2,
             fulfillment_status = 'in_transit',
             updated_at = NOW()
         WHERE shopify_order_id = $3`,
        [trackingNumber, tracking.tracking_url, shopifyOrderId]
      );

      logger.info(`Tracking created for order ${shopifyOrderId}`, {
        trackingNumber,
        trackingUrl: tracking.tracking_url,
      });
    } catch (error) {
      logger.error(`Failed to create tracking for order ${shopifyOrderId}`, error);
      throw error;
    }
  }

  async getTrackingHistory(trackingNumber: string): Promise<any[]> {
    try {
      const response = await this.client.get(`/trackings/${trackingNumber}/checkpoints`);
      return response.data.data.checkpoints || [];
    } catch (error) {
      logger.error(`Failed to get tracking history for ${trackingNumber}`, error);
      return [];
    }
  }
}

export const afterShipService = new AfterShipService();