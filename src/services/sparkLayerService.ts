import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';
import { SyncError } from '../utils/errors';
import { query } from '../db/connection';

interface PriceList {
  customerGroup: string;
  productId: string;
  price: number;
  tiers?: Array<{
    minQuantity: number;
    price: number;
  }>;
}

interface B2BCustomer {
  shopifyCustomerId: string;
  email: string;
  companyName: string;
  netTerms?: number;
  priceListId?: string;
}

interface SparkLayerCompany {
  id: string;
  name: string;
  email: string;
  customer_group: string;
  net_terms: number;
  price_list_id: string;
}

class SparkLayerService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.sparklayer.io',
      headers: {
        Authorization: `Bearer ${config.sparklayerApiKey}`,
        'X-SparkLayer-SiteId': config.sparklayerSiteId,
      },
      timeout: 30000,
    });

    this.client.interceptors.request.use((request) => {
      logger.debug('SparkLayer API request', { method: request.method, url: request.url });
      return request;
    });

    this.client.interceptors.response.use(
      (response) => {
        logger.debug('SparkLayer API response', { status: response.status, url: response.config.url });
        return response;
      },
      (error) => {
        logger.error('SparkLayer API error', {
          status: error.response?.status,
          url: error.config?.url,
          message: error.message,
        });
        throw error;
      }
    );
  }

  async pushPricing(productId: string, wholesalePrice: number, tiers?: Array<{ minQuantity: number; price: number }>): Promise<void> {
    try {
      const priceList: PriceList = {
        customerGroup: 'wholesale',
        productId,
        price: wholesalePrice,
        tiers,
      };

      await this.client.post('/pricing', {
        siteId: config.sparklayerSiteId,
        priceLists: [priceList],
      });

      logger.info(`Pricing pushed for product ${productId}`, { wholesalePrice, tiers });
    } catch (error) {
      throw new SyncError(`Failed to push pricing for product ${productId}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async bulkPushPricing(products: Array<{ productId: string; wholesalePrice: number; tiers?: Array<{ minQuantity: number; price: number }> }>): Promise<void> {
    try {
      const priceLists = products.map((p) => ({
        customerGroup: 'wholesale',
        productId: p.productId,
        price: p.wholesalePrice,
        tiers: p.tiers,
      }));

      await this.client.post('/pricing', {
        siteId: config.sparklayerSiteId,
        priceLists,
      });

      logger.info(`Bulk pricing pushed for ${products.length} products`);
    } catch (error) {
      throw new SyncError('Failed to bulk push pricing', {
        error: error instanceof Error ? error.message : 'Unknown error',
        productCount: products.length,
      });
    }
  }

  async createCompany(customer: B2BCustomer): Promise<SparkLayerCompany> {
    try {
      const response = await this.client.post('/companies', {
        siteId: config.sparklayerSiteId,
        company: {
          name: customer.companyName,
          email: customer.email,
          customer_group: 'wholesale',
          net_terms: customer.netTerms || 0,
          price_list_id: customer.priceListId || 'default',
          external_id: customer.shopifyCustomerId,
        },
      });

      const company = response.data.company;
      logger.info(`Created SparkLayer company for customer ${customer.shopifyCustomerId}`, {
        companyId: company.id,
        companyName: company.name,
      });

      return company;
    } catch (error) {
      throw new SyncError(`Failed to create SparkLayer company for customer ${customer.shopifyCustomerId}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async updateCompany(sparklayerCompanyId: string, updates: Partial<B2BCustomer>): Promise<void> {
    try {
      await this.client.put(`/companies/${sparklayerCompanyId}`, {
        siteId: config.sparklayerSiteId,
        company: {
          ...(updates.companyName && { name: updates.companyName }),
          ...(updates.email && { email: updates.email }),
          ...(updates.netTerms !== undefined && { net_terms: updates.netTerms }),
          ...(updates.priceListId && { price_list_id: updates.priceListId }),
        },
      });

      logger.info(`Updated SparkLayer company ${sparklayerCompanyId}`);
    } catch (error) {
      throw new SyncError(`Failed to update SparkLayer company ${sparklayerCompanyId}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async handleNewB2BCustomer(shopifyCustomer: any): Promise<void> {
    try {
      // Extract customer data from Shopify webhook
      const customerData: B2BCustomer = {
        shopifyCustomerId: shopifyCustomer.id,
        email: shopifyCustomer.email,
        companyName: shopifyCustomer.company || shopifyCustomer.email.split('@')[0],
        netTerms: parseInt(shopifyCustomer.net_terms || '0'),
        priceListId: shopifyCustomer.price_list_id || 'default',
      };

      // Create company in SparkLayer
      const sparklayerCompany = await this.createCompany(customerData);

      // Store mapping in database
      await query(
        `INSERT INTO b2b_customers (shopify_customer_id, sparklayer_company_id, price_list_id, approval_status, net_terms, company_name, email)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (shopify_customer_id)
         DO UPDATE SET
           sparklayer_company_id = EXCLUDED.sparklayer_company_id,
           price_list_id = EXCLUDED.price_list_id,
           net_terms = EXCLUDED.net_terms,
           company_name = EXCLUDED.company_name,
           email = EXCLUDED.email,
           updated_at = NOW()`,
        [
          customerData.shopifyCustomerId,
          sparklayerCompany.id,
          customerData.priceListId,
          'approved',
          customerData.netTerms,
          customerData.companyName,
          customerData.email,
        ]
      );

      logger.info(`B2B customer ${shopifyCustomer.id} processed and approved`);
    } catch (error) {
      // Log failure but don't throw - we'll retry via job queue
      await query(
        `INSERT INTO b2b_customers (shopify_customer_id, approval_status, email, company_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (shopify_customer_id)
         DO UPDATE SET approval_status = EXCLUDED.approval_status, updated_at = NOW()`,
        [shopifyCustomer.id, 'pending', shopifyCustomer.email, shopifyCustomer.company || '']
      );

      logger.error(`Failed to process B2B customer ${shopifyCustomer.id}`, error);
      throw error;
    }
  }

  async syncProductPricing(): Promise<{ synced: number; failed: number }> {
    logger.info('Starting product pricing sync to SparkLayer');

    try {
      // Get all products from database
      const result = await query('SELECT shopify_id, wholesale_price FROM products WHERE wholesale_price IS NOT NULL');
      const products = result.rows;

      logger.info(`Found ${products.length} products with pricing to sync`);

      const priceData = products.map((p) => ({
        productId: p.shopify_id,
        wholesalePrice: parseFloat(p.wholesale_price),
      }));

      await this.bulkPushPricing(priceData);

      // Log sync completion
      await query(
        `INSERT INTO sync_logs (type, status, details, completed_at)
         VALUES ($1, $2, $3, NOW())`,
        ['pricing', 'success', JSON.stringify({ total: products.length, synced: products.length })]
      );

      logger.info(`Pricing sync completed for ${products.length} products`);
      return { synced: products.length, failed: 0 };
    } catch (error) {
      await query(
        `INSERT INTO sync_logs (type, status, details, error_message, completed_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        ['pricing', 'failed', {}, error instanceof Error ? error.message : 'Unknown error']
      );
      throw error;
    }
  }
}

export const sparkLayerService = new SparkLayerService();