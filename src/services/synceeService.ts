import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';
import { SyncError } from '../utils/errors';
import { query } from '../db/connection';

interface SynceeProduct {
  id: string;
  sku: string;
  title: string;
  description: string;
  price: number;
  wholesale_price: number;
  quantity: number;
  images: string[];
  supplier_id: string;
  categories: string[];
  updated_at: string;
}

interface ShopifyProduct {
  id: string;
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  variants: Array<{
    id: string;
    sku: string;
    price: string;
    inventory_quantity: number;
  }>;
  images: Array<{
    src: string;
  }>;
}

class SynceeService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.syncee.com',
      auth: {
        username: config.synceeApiKey,
        password: config.synceeApiSecret,
      },
      timeout: 30000,
    });

    this.client.interceptors.request.use((request) => {
      logger.debug('Syncee API request', { method: request.method, url: request.url });
      return request;
    });

    this.client.interceptors.response.use(
      (response) => {
        logger.debug('Syncee API response', { status: response.status, url: response.config.url });
        return response;
      },
      (error) => {
        logger.error('Syncee API error', {
          status: error.response?.status,
          url: error.config?.url,
          message: error.message,
        });
        throw error;
      }
    );
  }

  async getUpdatedProducts(since?: Date): Promise<SynceeProduct[]> {
    try {
      const params: any = {
        limit: 250,
        sort: 'updated_at',
      };

      if (since) {
        params.updated_at_min = since.toISOString();
      }

      const response = await this.client.get('/products', { params });
      return response.data.products || [];
    } catch (error) {
      throw new SyncError('Failed to fetch updated products from Syncee', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getProductById(productId: string): Promise<SynceeProduct | null> {
    try {
      const response = await this.client.get(`/products/${productId}`);
      return response.data.product || null;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw new SyncError(`Failed to fetch product ${productId} from Syncee`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getSuppliers(): Promise<any[]> {
    try {
      const response = await this.client.get('/suppliers');
      return response.data.suppliers || [];
    } catch (error) {
      throw new SyncError('Failed to fetch suppliers from Syncee', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private mapProductToShopify(synceeProduct: SynceeProduct): ShopifyProduct {
    return {
      id: synceeProduct.id,
      title: synceeProduct.title,
      body_html: synceeProduct.description,
      vendor: synceeProduct.supplier_id,
      product_type: synceeProduct.categories[0] || 'General',
      variants: [
        {
          id: synceeProduct.id,
          sku: synceeProduct.sku,
          price: synceeProduct.retail_price.toString(),
          inventory_quantity: synceeProduct.quantity,
        },
      ],
      images: synceeProduct.images.map((src) => ({ src })),
    };
  }

  private calculateWholesalePrice(retailPrice: number, margin: number = 0.3): number {
    return Number((retailPrice * (1 - margin)).toFixed(2));
  }

  async syncCatalog(): Promise<{ synced: number; failed: number }> {
    logger.info('Starting catalog sync from Syncee');
    
    try {
      const products = await this.getUpdatedProducts();
      logger.info(`Found ${products.length} products to sync`);

      let synced = 0;
      let failed = 0;

      for (const product of products) {
        try {
          // Map product data
          const mappedProduct = this.mapProductToShopify(product);
          const wholesalePrice = this.calculateWholesalePrice(product.retail_price);

          // Upsert to database
          await query(
            `INSERT INTO products (shopify_id, syncee_id, sku, title, description, wholesale_price, retail_price, inventory_count, last_synced)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
             ON CONFLICT (shopify_id) 
             DO UPDATE SET 
               syncee_id = EXCLUDED.syncee_id,
               sku = EXCLUDED.sku,
               title = EXCLUDED.title,
               description = EXCLUDED.description,
               wholesale_price = EXCLUDED.wholesale_price,
               retail_price = EXCLUDED.retail_price,
               inventory_count = EXCLUDED.inventory_count,
               last_synced = NOW()`,
            [
              product.id,
              product.id,
              product.sku,
              product.title,
              product.description,
              wholesalePrice,
              product.retail_price,
              product.quantity,
            ]
          );

          synced++;
        } catch (error) {
          logger.error(`Failed to sync product ${product.id}`, error);
          failed++;
        }
      }

      // Log sync completion
      await query(
        `INSERT INTO sync_logs (type, status, details, completed_at)
         VALUES ($1, $2, $3, NOW())`,
        [
          'catalog',
          failed === 0 ? 'success' : 'partial',
          JSON.stringify({ total: products.length, synced, failed }),
        ]
      );

      logger.info(`Catalog sync completed: ${synced} synced, ${failed} failed`);
      return { synced, failed };
    } catch (error) {
      await query(
        `INSERT INTO sync_logs (type, status, details, error_message, completed_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        ['catalog', 'failed', {}, error instanceof Error ? error.message : 'Unknown error']
      );
      throw error;
    }
  }
}

export const synceeService = new SynceeService();