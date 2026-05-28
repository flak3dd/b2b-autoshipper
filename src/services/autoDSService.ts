import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';
import { FulfillmentError } from '../utils/errors';
import { query } from '../db/connection';

interface LineItem {
  productId: string;
  sku: string;
  quantity: number;
  price: number;
}

interface AutoDSOrder {
  orderId: string;
  lineItems: LineItem[];
  shippingAddress: {
    firstName: string;
    lastName: string;
    address1: string;
    address2?: string;
    city: string;
    province: string;
    country: string;
    zip: string;
    phone?: string;
  };
  supplier: string;
}

interface AutoDSResponse {
  orderId: string;
  supplierOrderId: string;
  status: string;
  trackingNumber?: string;
  estimatedDelivery?: string;
}

class AutoDSService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.autods.com',
      headers: {
        'X-API-Key': config.autodsApiKey,
        'X-API-Secret': config.autodsApiSecret,
      },
      timeout: 30000,
    });

    this.client.interceptors.request.use((request) => {
      logger.debug('AutoDS API request', { method: request.method, url: request.url });
      return request;
    });

    this.client.interceptors.response.use(
      (response) => {
        logger.debug('AutoDS API response', { status: response.status, url: response.config.url });
        return response;
      },
      (error) => {
        logger.error('AutoDS API error', {
          status: error.response?.status,
          url: error.config?.url,
          message: error.message,
        });
        throw error;
      }
    );
  }

  async placeOrder(order: AutoDSOrder): Promise<AutoDSResponse> {
    try {
      const response = await this.client.post('/orders', {
        order_id: order.orderId,
        line_items: order.lineItems,
        shipping_address: order.shippingAddress,
        supplier: order.supplier,
      });

      const result = response.data;
      logger.info(`AutoDS order placed for Shopify order ${order.orderId}`, {
        supplierOrderId: result.supplierOrderId,
        status: result.status,
      });

      return result;
    } catch (error) {
      throw new FulfillmentError(`Failed to place AutoDS order for ${order.orderId}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        orderId: order.orderId,
      });
    }
  }

  async getOrderStatus(supplierOrderId: string): Promise<AutoDSResponse> {
    try {
      const response = await this.client.get(`/orders/${supplierOrderId}`);
      return response.data;
    } catch (error) {
      throw new FulfillmentError(`Failed to get AutoDS order status for ${supplierOrderId}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async checkInventory(productId: string): Promise<number> {
    try {
      const response = await this.client.get(`/inventory/${productId}`);
      return response.data.quantity || 0;
    } catch (error) {
      logger.error(`Failed to check inventory for product ${productId}`, error);
      return 0;
    }
  }

  private mapLineItems(shopifyLineItems: any[]): LineItem[] {
    return shopifyLineItems.map((item) => ({
      productId: item.product_id || item.variant_id,
      sku: item.sku,
      quantity: item.quantity,
      price: parseFloat(item.price),
    }));
  }

  private mapShippingAddress(shopifyShippingAddress: any): AutoDSOrder['shippingAddress'] {
    return {
      firstName: shopifyShippingAddress.first_name,
      lastName: shopifyShippingAddress.last_name,
      address1: shopifyShippingAddress.address1,
      address2: shopifyShippingAddress.address2,
      city: shopifyShippingAddress.city,
      province: shopifyShippingAddress.province || shopifyShippingAddress.state,
      country: shopifyShippingAddress.country,
      zip: shopifyShippingAddress.zip || shopifyShippingAddress.postal_code,
      phone: shopifyShippingAddress.phone,
    };
  }

  async fulfillOrder(shopifyOrder: any, supplier: string): Promise<AutoDSResponse> {
    try {
      const autoDSOrder: AutoDSOrder = {
        orderId: shopifyOrder.id,
        lineItems: this.mapLineItems(shopifyOrder.line_items),
        shippingAddress: this.mapShippingAddress(shopifyOrder.shipping_address),
        supplier,
      };

      const response = await this.placeOrder(autoDSOrder);

      // Store order mapping in database
      await query(
        `INSERT INTO order_mappings (shopify_order_id, supplier_order_id, supplier_id, fulfillment_status)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (shopify_order_id)
         DO UPDATE SET
           supplier_order_id = EXCLUDED.supplier_order_id,
           supplier_id = EXCLUDED.supplier_id,
           fulfillment_status = EXCLUDED.fulfillment_status,
           updated_at = NOW()`,
        [shopifyOrder.id, response.supplierOrderId, await this.getSupplierId(supplier), response.status]
      );

      logger.info(`Order ${shopifyOrder.id} fulfilled via AutoDS`, {
        supplierOrderId: response.supplierOrderId,
        status: response.status,
      });

      return response;
    } catch (error) {
      // Log error in database
      await query(
        `INSERT INTO order_mappings (shopify_order_id, fulfillment_status, error_log)
         VALUES ($1, $2, $3)
         ON CONFLICT (shopify_order_id)
         DO UPDATE SET
           fulfillment_status = EXCLUDED.fulfillment_status,
           error_log = EXCLUDED.error_log,
           updated_at = NOW()`,
        [shopifyOrder.id, 'failed', error instanceof Error ? error.message : 'Unknown error']
      );

      throw error;
    }
  }

  private async getSupplierId(supplierName: string): Promise<number> {
    try {
      const result = await query('SELECT id FROM suppliers WHERE name = $1', [supplierName]);
      if (result.rows.length === 0) {
        // Create supplier if it doesn't exist
        const insertResult = await query(
          'INSERT INTO suppliers (name, priority) VALUES ($1, 1) RETURNING id',
          [supplierName]
        );
        return insertResult.rows[0].id;
      }
      return result.rows[0].id;
    } catch (error) {
      logger.error(`Failed to get/create supplier ID for ${supplierName}`, error);
      throw error;
    }
  }

  async syncInventory(): Promise<{ synced: number; failed: number }> {
    logger.info('Starting inventory sync from AutoDS');

    try {
      // Get all products from database
      const result = await query('SELECT shopify_id, sku FROM products');
      const products = result.rows;

      let synced = 0;
      let failed = 0;

      for (const product of products) {
        try {
          const quantity = await this.checkInventory(product.shopify_id);
          
          await query(
            `UPDATE products 
             SET inventory_count = $1, last_synced = NOW() 
             WHERE shopify_id = $2`,
            [quantity, product.shopify_id]
          );

          synced++;
        } catch (error) {
          logger.error(`Failed to sync inventory for product ${product.shopify_id}`, error);
          failed++;
        }
      }

      // Log sync completion
      await query(
        `INSERT INTO sync_logs (type, status, details, completed_at)
         VALUES ($1, $2, $3, NOW())`,
        ['inventory', failed === 0 ? 'success' : 'partial', JSON.stringify({ total: products.length, synced, failed })]
      );

      logger.info(`Inventory sync completed: ${synced} synced, ${failed} failed`);
      return { synced, failed };
    } catch (error) {
      await query(
        `INSERT INTO sync_logs (type, status, details, error_message, completed_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        ['inventory', 'failed', {}, error instanceof Error ? error.message : 'Unknown error']
      );
      throw error;
    }
  }
}

export const autoDSService = new AutoDSService();