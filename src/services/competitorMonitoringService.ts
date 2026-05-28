import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger';
import { query } from '../db/connection';
import { monitoringService } from '../utils/monitoring';

interface CompetitorConfig {
  name: string;
  baseUrl: string;
  searchUrl: string;
  productSelector: string;
  priceSelector: string;
  titleSelector: string;
  availabilitySelector: string;
  ratingSelector?: string;
}

interface CompetitorProduct {
  title: string;
  url: string;
  price: number;
  category: string;
  availability: boolean;
  rating?: number;
  reviewCount?: number;
  competitorId: number;
}

interface PriceChange {
  productId: string;
  oldPrice: number;
  newPrice: number;
  changePercentage: number;
  competitorName: string;
  timestamp: Date;
}

class CompetitorMonitoringService {
  private competitors: Map<string, CompetitorConfig> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private priceChangeThreshold = 0.05; // 5% change threshold

  constructor() {
    this.initializeCompetitors();
  }

  /**
   * Initialize competitor configurations
   */
  private initializeCompetitors(): void {
    // Example competitor configurations (in production, load from database)
    const competitorConfigs: CompetitorConfig[] = [
      {
        name: 'Amazon',
        baseUrl: 'https://www.amazon.com',
        searchUrl: 'https://www.amazon.com/s?k=',
        productSelector: '.s-result-item',
        priceSelector: '.a-price .a-offscreen',
        titleSelector: '.a-size-medium',
        availabilitySelector: '.a-size-base',
        ratingSelector: '.a-icon-alt',
      },
      {
        name: 'eBay',
        baseUrl: 'https://www.ebay.com',
        searchUrl: 'https://www.ebay.com/sch/i.html?_nkw=',
        productSelector: '.s-item',
        priceSelector: '.s-item__price',
        titleSelector: '.s-item__title',
        availabilitySelector: '.s-item__availability',
      },
      // Add more competitors as needed
    ];

    competitorConfigs.forEach(config => {
      this.competitors.set(config.name, config);
    });

    logger.info(`Initialized ${this.competitors.size} competitor configurations`);
  }

  /**
   * Start real-time monitoring
   */
  startMonitoring(intervalMinutes: number = 15): void {
    if (this.monitoringInterval) {
      logger.warn('Monitoring is already running');
      return;
    }

    logger.info(`Starting competitor monitoring with ${intervalMinutes} minute intervals`);
    
    // Initial scan
    this.runMonitoringCycle();

    // Schedule regular monitoring
    this.monitoringInterval = setInterval(() => {
      this.runMonitoringCycle();
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Competitor monitoring stopped');
    }
  }

  /**
   * Run a complete monitoring cycle
   */
  private async runMonitoringCycle(): Promise<void> {
    try {
      logger.info('Starting competitor monitoring cycle');

      for (const [competitorName, config] of this.competitors) {
        try {
          await this.monitorCompetitor(competitorName, config);
        } catch (error) {
          logger.error(`Failed to monitor competitor ${competitorName}`, error);
        }
      }

      logger.info('Competitor monitoring cycle completed');
    } catch (error) {
      logger.error('Competitor monitoring cycle failed', error);
    }
  }

  /**
   * Monitor a specific competitor
   */
  private async monitorCompetitor(competitorName: string, config: CompetitorConfig): Promise<void> {
    try {
      logger.info(`Monitoring competitor: ${competitorName}`);

      // Get competitor ID from database or create new
      const competitorId = await this.getOrCreateCompetitor(competitorName);

      // Monitor key products (in production, would monitor full catalog)
      const keywords = await this.getMonitoringKeywords();
      const products: CompetitorProduct[] = [];

      for (const keyword of keywords.slice(0, 3)) { // Limit to 3 keywords per cycle
        const searchResults = await this.searchCompetitorProducts(config, keyword);
        products.push(...searchResults);
      }

      // Process and store product data
      await this.processCompetitorProducts(products, competitorId);

      // Check for significant price changes
      const priceChanges = await this.detectPriceChanges(competitorId);
      
      if (priceChanges.length > 0) {
        await this.handlePriceChanges(priceChanges);
      }

      logger.info(`Completed monitoring for ${competitorName}: ${products.length} products tracked`);
    } catch (error) {
      logger.error(`Failed to monitor competitor ${competitorName}`, error);
      throw error;
    }
  }

  /**
   * Search for products on competitor site
   */
  private async searchCompetitorProducts(config: CompetitorConfig, keyword: string): Promise<CompetitorProduct[]> {
    try {
      const searchUrl = `${config.searchUrl}${encodeURIComponent(keyword)}`;
      
      // Note: In production, use proper headers and rate limiting
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 10000,
      });

      const $ = cheerio.load(response.data);
      const products: CompetitorProduct[] = [];

      $(config.productSelector).each((index, element) => {
        if (index >= 10) return false; // Limit to 10 results per search

        const $element = $(element);
        const title = $element.find(config.titleSelector).text().trim();
        const priceText = $element.find(config.priceSelector).text().trim();
        const productUrl = $element.find('a').attr('href') || '';
        
        if (title && priceText) {
          const price = this.parsePrice(priceText);
          const availability = this.checkAvailability($element, config.availabilitySelector);
          const rating = this.parseRating($element, config.ratingSelector);

          products.push({
            title,
            url: productUrl.startsWith('http') ? productUrl : config.baseUrl + productUrl,
            price,
            category: keyword,
            availability,
            rating,
            competitorId: 0, // Will be set by caller
          });
        }
      });

      return products;
    } catch (error) {
      logger.error(`Failed to search ${config.name} for keyword: ${keyword}`, error);
      return [];
    }
  }

  /**
   * Parse price from text
   */
  private parsePrice(priceText: string): number {
    const cleanedPrice = priceText.replace(/[^0-9.]/g, '');
    const price = parseFloat(cleanedPrice);
    return isNaN(price) ? 0 : price;
  }

  /**
   * Check product availability
   */
  private checkAvailability($element: cheerio.Cheerio<any>, selector: string): boolean {
    const availabilityText = $element.find(selector).text().toLowerCase();
    return !availabilityText.includes('out of stock') && 
           !availabilityText.includes('unavailable');
  }

  /**
   * Parse rating from element
   */
  private parseRating($element: cheerio.Cheerio<any>, selector?: string): number | undefined {
    if (!selector) return undefined;
    
    const ratingText = $element.find(selector).text().trim();
    const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
    return ratingMatch ? parseFloat(ratingMatch[1]) : undefined;
  }

  /**
   * Get or create competitor in database
   */
  private async getOrCreateCompetitor(competitorName: string): Promise<number> {
    try {
      const result = await query(
        'SELECT id FROM competitor_analysis WHERE competitor_name = $1',
        [competitorName]
      );

      if (result.rows.length > 0) {
        return result.rows[0].id;
      }

      // Create new competitor entry
      const insertResult = await query(
        `INSERT INTO competitor_analysis (competitor_name, market_share, pricing_strategy, product_count, average_price)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [competitorName, 0, 'Unknown', 0, 0]
      );

      return insertResult.rows[0].id;
    } catch (error) {
      logger.error(`Failed to get/create competitor ${competitorName}`, error);
      throw error;
    }
  }

  /**
   * Get keywords to monitor
   */
  private async getMonitoringKeywords(): Promise<string[]> {
    try {
      // Get top keywords from product research
      const result = await query(
        `SELECT DISTINCT unnest(tags) as keyword 
         FROM product_research 
         ORDER BY random() 
         LIMIT 20`
      );

      return result.rows.map(row => row.keyword);
    } catch (error) {
      logger.error('Failed to get monitoring keywords', error);
      return ['electronics', 'clothing', 'home', 'sports', 'beauty'];
    }
  }

  /**
   * Process and store competitor product data
   */
  private async processCompetitorProducts(products: CompetitorProduct[], competitorId: number): Promise<void> {
    for (const product of products) {
      product.competitorId = competitorId;
      
      try {
        // Check if product already exists
        const existingResult = await query(
          'SELECT id, price, price_history FROM competitor_products WHERE product_url = $1',
          [product.url]
        );

        if (existingResult.rows.length > 0) {
          // Update existing product
          const existingProduct = existingResult.rows[0];
          const priceHistory = existingProduct.price_history || [];
          
          // Add current price to history
          priceHistory.push({
            price: product.price,
            timestamp: new Date().toISOString(),
          });

          // Keep only last 30 price points
          if (priceHistory.length > 30) {
            priceHistory.shift();
          }

          await query(
            `UPDATE competitor_products 
             SET price = $1, availability = $2, rating = $3, review_count = $4, 
                 last_seen = NOW(), price_history = $5, updated_at = NOW()
             WHERE id = $6`,
            [product.price, product.availability, product.rating, product.reviewCount, 
             JSON.stringify(priceHistory), existingProduct.id]
          );
        } else {
          // Insert new product
          await query(
            `INSERT INTO competitor_products (competitor_id, product_title, product_url, price, 
             category, availability, rating, review_count, price_history)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [competitorId, product.title, product.url, product.price, product.category,
             product.availability, product.rating, product.reviewCount,
             JSON.stringify([{ price: product.price, timestamp: new Date().toISOString() }])]
          );
        }
      } catch (error) {
        logger.error(`Failed to process competitor product: ${product.title}`, error);
      }
    }
  }

  /**
   * Detect significant price changes
   */
  private async detectPriceChanges(competitorId: number): Promise<PriceChange[]> {
    try {
      const result = await query(
        `SELECT id, product_title, price, price_history 
         FROM competitor_products 
         WHERE competitor_id = $1 
         AND last_seen > NOW() - INTERVAL '1 hour'
         ORDER BY last_seen DESC`,
        [competitorId]
      );

      const priceChanges: PriceChange[] = [];

      for (const row of result.rows) {
        const priceHistory = row.price_history || [];
        
        if (priceHistory.length >= 2) {
          const oldPrice = priceHistory[priceHistory.length - 2].price;
          const newPrice = priceHistory[priceHistory.length - 1].price;
          const changePercentage = Math.abs((newPrice - oldPrice) / oldPrice);

          if (changePercentage >= this.priceChangeThreshold) {
            priceChanges.push({
              productId: row.id.toString(),
              oldPrice,
              newPrice,
              changePercentage,
              competitorName: await this.getCompetitorName(competitorId),
              timestamp: new Date(),
            });
          }
        }
      }

      return priceChanges;
    } catch (error) {
      logger.error('Failed to detect price changes', error);
      return [];
    }
  }

  /**
   * Get competitor name by ID
   */
  private async getCompetitorName(competitorId: number): Promise<string> {
    try {
      const result = await query(
        'SELECT competitor_name FROM competitor_analysis WHERE id = $1',
        [competitorId]
      );
      return result.rows[0]?.competitor_name || 'Unknown';
    } catch (error) {
      return 'Unknown';
    }
  }

  /**
   * Handle significant price changes
   */
  private async handlePriceChanges(priceChanges: PriceChange[]): Promise<void> {
    logger.info(`Handling ${priceChanges.length} significant price changes`);

    for (const change of priceChanges) {
      // Store in pricing history
      await query(
        `INSERT INTO pricing_history (product_id, competitor_price, price_change, change_reason, source)
         VALUES ($1, $2, $3, $4, $5)`,
        [change.productId, change.newPrice, change.changePercentage, 
         `Price changed by ${(change.changePercentage * 100).toFixed(2)}%`, 
         change.competitorName]
      );

      // Send alert if significant
      if (change.changePercentage > 0.10) { // 10% change
        await monitoringService.alertError(
          new Error(`Significant price change detected: ${change.competitorName}`),
          {
            productId: change.productId,
            oldPrice: change.oldPrice,
            newPrice: change.newPrice,
            changePercentage: change.changePercentage,
          }
        );
      }
    }
  }

  /**
   * Get competitor pricing data for a product
   */
  async getCompetitorPricing(productTitle: string): Promise<any[]> {
    try {
      const result = await query(
        `SELECT cp.*, ca.competitor_name 
         FROM competitor_products cp
         JOIN competitor_analysis ca ON cp.competitor_id = ca.id
         WHERE cp.product_title ILIKE $1
         AND cp.last_seen > NOW() - INTERVAL '7 days'
         ORDER BY cp.last_seen DESC`,
        [`%${productTitle}%`]
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to get competitor pricing', error);
      return [];
    }
  }

  /**
   * Analyze competitor pricing patterns
   */
  async analyzePricingPatterns(competitorName: string): Promise<any> {
    try {
      const competitorId = await this.getOrCreateCompetitor(competitorName);
      
      const result = await query(
        `SELECT 
           AVG(price) as avg_price,
           MIN(price) as min_price,
           MAX(price) as max_price,
           STDDEV(price) as price_stddev,
           COUNT(*) as product_count
         FROM competitor_products
         WHERE competitor_id = $1
         AND last_seen > NOW() - INTERVAL '30 days'`,
        [competitorId]
      );

      const stats = result.rows[0];
      
      return {
        competitorName,
        averagePrice: parseFloat(stats.avg_price),
        minPrice: parseFloat(stats.min_price),
        maxPrice: parseFloat(stats.max_price),
        priceRange: parseFloat(stats.max_price) - parseFloat(stats.min_price),
        priceVolatility: parseFloat(stats.price_stddev),
        productCount: parseInt(stats.product_count),
      };
    } catch (error) {
      logger.error(`Failed to analyze pricing patterns for ${competitorName}`, error);
      return null;
    }
  }

  /**
   * Get real-time competitor alerts
   */
  async getCompetitorAlerts(hours: number = 24): Promise<any[]> {
    try {
      const result = await query(
        `SELECT ph.*, ca.competitor_name
         FROM pricing_history ph
         JOIN competitor_products cp ON ph.product_id = cp.id::text
         JOIN competitor_analysis ca ON cp.competitor_id = ca.id
         WHERE ABS(ph.price_change) > 0.05
         AND ph.created_at > NOW() - INTERVAL '${hours} hours'
         ORDER BY ph.created_at DESC
         LIMIT 50`
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to get competitor alerts', error);
      return [];
    }
  }

  /**
   * Add custom competitor
   */
  async addCompetitor(config: CompetitorConfig): Promise<void> {
    this.competitors.set(config.name, config);
    
    await this.getOrCreateCompetitor(config.name);
    logger.info(`Added custom competitor: ${config.name}`);
  }

  /**
   * Remove competitor
   */
  async removeCompetitor(competitorName: string): Promise<void> {
    this.competitors.delete(competitorName);
    logger.info(`Removed competitor: ${competitorName}`);
  }
}

export const competitorMonitoringService = new CompetitorMonitoringService();