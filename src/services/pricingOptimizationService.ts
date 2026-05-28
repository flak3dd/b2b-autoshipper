import { logger } from '../utils/logger';
import { query } from '../db/connection';
import { aiProductResearchService } from './aiProductResearchService';
import { competitorMonitoringService } from './competitorMonitoringService';
import { predictiveAnalyticsService } from './predictiveAnalyticsService';

interface PricingOptimization {
  productId: string;
  currentPrice: number;
  recommendedPrice: number;
  priceChange: number;
  changePercentage: number;
  confidence: number;
  factors: {
    competitorPricing: number;
    demandForecast: number;
    marketPotential: number;
    competitionLevel: number;
    seasonality: number;
    inventoryLevel: number;
  };
  reasoning: string[];
  implementationStrategy: 'immediate' | 'gradual' | 'test';
  expectedImpact: {
    revenueChange: number;
    volumeChange: number;
    marginChange: number;
  };
}

interface PricingRule {
  id: string;
  name: string;
  condition: string;
  action: string;
  priority: number;
  enabled: boolean;
}

class PricingOptimizationService {
  private pricingRules: PricingRule[] = [];
  private optimizationInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initializePricingRules();
  }

  /**
   * Initialize pricing rules
   */
  private initializePricingRules(): void {
    this.pricingRules = [
      {
        id: 'competitor_match',
        name: 'Match Competitor Pricing',
        condition: 'competitor_price < current_price * 0.95',
        action: 'reduce_price_to_match',
        priority: 1,
        enabled: true,
      },
      {
        id: 'demand_based_increase',
        name: 'Demand-Based Price Increase',
        condition: 'demand_forecast > 80 AND competition < 0.4',
        action: 'increase_price_5_10_percent',
        priority: 2,
        enabled: true,
      },
      {
        id: 'inventory_clearance',
        name: 'Inventory Clearance',
        condition: 'inventory_level < 20 AND demand_forecast < 40',
        action: 'reduce_price_15_25_percent',
        priority: 3,
        enabled: true,
      },
      {
        id: 'seasonal_adjustment',
        name: 'Seasonal Price Adjustment',
        condition: 'seasonality_factor > 1.1',
        action: 'increase_price_3_7_percent',
        priority: 4,
        enabled: true,
      },
      {
        id: 'market_trend_follow',
        name: 'Market Trend Following',
        condition: 'market_trend_score > 0.8',
        action: 'adjust_price_based_on_trend',
        priority: 5,
        enabled: true,
      },
    ];

    logger.info(`Initialized ${this.pricingRules.length} pricing rules`);
  }

  /**
   * Start automated pricing optimization
   */
  startOptimization(intervalHours: number = 4): void {
    if (this.optimizationInterval) {
      logger.warn('Pricing optimization is already running');
      return;
    }

    logger.info(`Starting automated pricing optimization with ${intervalHours} hour intervals`);

    // Initial optimization
    this.runOptimizationCycle();

    // Schedule regular optimization
    this.optimizationInterval = setInterval(() => {
      this.runOptimizationCycle();
    }, intervalHours * 60 * 60 * 1000);
  }

  /**
   * Stop pricing optimization
   */
  stopOptimization(): void {
    if (this.optimizationInterval) {
      clearInterval(this.optimizationInterval);
      this.optimizationInterval = null;
      logger.info('Pricing optimization stopped');
    }
  }

  /**
   * Run complete pricing optimization cycle
   */
  private async runOptimizationCycle(): Promise<void> {
    try {
      logger.info('Starting pricing optimization cycle');

      // Get products that need pricing review
      const products = await this.getProductsForOptimization();

      const optimizations: PricingOptimization[] = [];

      for (const product of products) {
        try {
          const optimization = await this.optimizeProductPricing(product.shopify_id);
          if (optimization) {
            optimizations.push(optimization);
          }
        } catch (error) {
          logger.error(`Failed to optimize pricing for product ${product.shopify_id}`, error);
        }
      }

      // Apply optimizations
      for (const optimization of optimizations) {
        await this.applyPricingOptimization(optimization);
      }

      logger.info(`Pricing optimization cycle completed: ${optimizations.length} optimizations applied`);
    } catch (error) {
      logger.error('Pricing optimization cycle failed', error);
    }
  }

  /**
   * Get products that need pricing optimization
   */
  private async getProductsForOptimization(): Promise<any[]> {
    try {
      const result = await query(
        `SELECT shopify_id, retail_price, wholesale_price, inventory_count 
         FROM products 
         WHERE last_synced > NOW() - INTERVAL '7 days'
         ORDER BY random()
         LIMIT 50` // Process 50 products per cycle
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to get products for optimization', error);
      return [];
    }
  }

  /**
   * Optimize pricing for a specific product
   */
  async optimizeProductPricing(productId: string): Promise<PricingOptimization | null> {
    try {
      logger.info(`Optimizing pricing for product ${productId}`);

      // Gather pricing factors
      const factors = await this.gatherPricingFactors(productId);

      // Calculate optimal price using AI
      const optimalPrice = await this.calculateOptimalPrice(productId, factors);

      // Get current price
      const currentPrice = await this.getCurrentPrice(productId);

      if (!currentPrice) {
        logger.warn(`No current price found for product ${productId}`);
        return null;
      }

      const priceChange = optimalPrice - currentPrice;
      const changePercentage = Math.abs(priceChange / currentPrice);

      // Only recommend significant changes (> 2%)
      if (changePercentage < 0.02) {
        logger.debug(`Price change too small for product ${productId}: ${(changePercentage * 100).toFixed(2)}%`);
        return null;
      }

      // Generate reasoning
      const reasoning = await this.generatePricingReasoning(factors, priceChange);

      // Determine implementation strategy
      const implementationStrategy = this.determineImplementationStrategy(priceChange, factors);

      // Calculate expected impact
      const expectedImpact = await this.calculateExpectedImpact(productId, currentPrice, optimalPrice, factors);

      const optimization: PricingOptimization = {
        productId,
        currentPrice,
        recommendedPrice: optimalPrice,
        priceChange,
        changePercentage,
        confidence: this.calculatePricingConfidence(factors),
        factors,
        reasoning,
        implementationStrategy,
        expectedImpact,
      };

      logger.info(`Pricing optimization generated for ${productId}`, {
        currentPrice,
        recommendedPrice: optimalPrice,
        changePercentage: (changePercentage * 100).toFixed(2),
        confidence: optimization.confidence,
      });

      return optimization;
    } catch (error) {
      logger.error(`Failed to optimize pricing for product ${productId}`, error);
      return null;
    }
  }

  /**
   * Gather all factors influencing pricing
   */
  private async gatherPricingFactors(productId: string): Promise<PricingOptimization['factors']> {
    // Get competitor pricing
    const competitorPricing = await this.getCompetitorPricingFactor(productId);

    // Get demand forecast
    const demandForecast = await this.getDemandForecastFactor(productId);

    // Get market potential
    const marketPotential = await this.getMarketPotentialFactor(productId);

    // Get competition level
    const competitionLevel = await this.getCompetitionLevelFactor(productId);

    // Get seasonality factor
    const seasonality = this.getSeasonalityFactor();

    // Get inventory level
    const inventoryLevel = await this.getInventoryLevelFactor(productId);

    return {
      competitorPricing,
      demandForecast,
      marketPotential,
      competitionLevel,
      seasonality,
      inventoryLevel,
    };
  }

  /**
   * Get competitor pricing factor
   */
  private async getCompetitorPricingFactor(productId: string): Promise<number> {
    try {
      const productData = await query(
        'SELECT title FROM products WHERE shopify_id = $1',
        [productId]
      );

      if (productData.rows.length === 0) return 0.5;

      const competitorPrices = await competitorMonitoringService.getCompetitorPricing(productData.rows[0].title);

      if (competitorPrices.length === 0) return 0.5;

      const avgCompetitorPrice = competitorPrices.reduce((sum, p) => sum + parseFloat(p.price), 0) / competitorPrices.length;
      const currentPrice = await this.getCurrentPrice(productId);

      if (!currentPrice) return 0.5;

      // Factor: 1 if we're higher priced, 0 if we're lower priced
      return Math.min(Math.max(avgCompetitorPrice / currentPrice, 0), 1);
    } catch (error) {
      return 0.5;
    }
  }

  /**
   * Get demand forecast factor
   */
  private async getDemandForecastFactor(productId: string): Promise<number> {
    try {
      const forecast = await predictiveAnalyticsService.generateDemandForecast(productId);
      return forecast.predictedDemand / 100; // Normalize to 0-1
    } catch (error) {
      return 0.5;
    }
  }

  /**
   * Get market potential factor
   */
  private async getMarketPotentialFactor(productId: string): Promise<number> {
    try {
      const result = await query(
        'SELECT market_potential FROM product_research WHERE product_id = $1',
        [productId]
      );

      return result.rows[0]?.market_potential || 0.5;
    } catch (error) {
      return 0.5;
    }
  }

  /**
   * Get competition level factor
   */
  private async getCompetitionLevelFactor(productId: string): Promise<number> {
    try {
      const result = await query(
        'SELECT competition_level FROM product_research WHERE product_id = $1',
        [productId]
      );

      return result.rows[0]?.competition_level || 0.5;
    } catch (error) {
      return 0.5;
    }
  }

  /**
   * Get seasonality factor
   */
  private getSeasonalityFactor(): number {
    const currentMonth = new Date().getMonth();
    const seasonalFactors = {
      0: 0.8,  // January
      1: 0.75, // February
      2: 0.85, // March
      3: 0.95, // April
      4: 1.0,  // May
      5: 1.1,  // June
      6: 1.05, // July
      7: 0.95, // August
      8: 1.0,  // September
      9: 1.1,  // October
      10: 1.2, // November
      11: 1.3, // December
    };

    return seasonalFactors[currentMonth as keyof typeof seasonalFactors] || 1.0;
  }

  /**
   * Get inventory level factor
   */
  private async getInventoryLevelFactor(productId: string): Promise<number> {
    try {
      const result = await query(
        'SELECT inventory_count FROM products WHERE shopify_id = $1',
        [productId]
      );

      const inventory = result.rows[0]?.inventory_count || 0;
      return Math.min(inventory / 100, 1); // Normalize to 0-1 (assuming 100 is normal level)
    } catch (error) {
      return 0.5;
    }
  }

  /**
   * Calculate optimal price using AI and rules
   */
  private async calculateOptimalPrice(productId: string, factors: PricingOptimization['factors']): Promise<number> {
    const currentPrice = await this.getCurrentPrice(productId);
    if (!currentPrice) return 0;

    let priceMultiplier = 1.0;

    // Apply pricing rules
    for (const rule of this.pricingRules.filter(r => r.enabled)) {
      if (await this.evaluateRule(rule, factors, currentPrice)) {
        priceMultiplier = await this.applyRuleAction(rule.action, priceMultiplier, factors);
      }
    }

    // AI-based adjustment
    const aiAdjustment = await this.calculateAIPriceAdjustment(factors);
    priceMultiplier *= aiAdjustment;

    // Calculate optimal price
    let optimalPrice = currentPrice * priceMultiplier;

    // Apply psychological pricing
    optimalPrice = this.applyPsychologicalPricing(optimalPrice);

    // Ensure minimum margin
    const wholesalePrice = await this.getWholesalePrice(productId);
    if (wholesalePrice) {
      const minPrice = wholesalePrice * 1.3; // 30% minimum margin
      optimalPrice = Math.max(optimalPrice, minPrice);
    }

    return Math.round(optimalPrice * 100) / 100;
  }

  /**
   * Evaluate if a pricing rule condition is met
   */
  private async evaluateRule(rule: PricingRule, factors: PricingOptimization['factors'], currentPrice: number): Promise<boolean> {
    // Simple rule evaluation (in production, would use a proper rule engine)
    switch (rule.id) {
      case 'competitor_match':
        return factors.competitorPricing < 0.95;
      
      case 'demand_based_increase':
        return factors.demandForecast > 0.8 && factors.competitionLevel < 0.4;
      
      case 'inventory_clearance':
        return factors.inventoryLevel < 0.2 && factors.demandForecast < 0.4;
      
      case 'seasonal_adjustment':
        return factors.seasonality > 1.1;
      
      case 'market_trend_follow':
        return factors.marketPotential > 0.8;
      
      default:
        return false;
    }
  }

  /**
   * Apply rule action to price multiplier
   */
  private async applyRuleAction(action: string, currentMultiplier: number, factors: PricingOptimization['factors']): Promise<number> {
    switch (action) {
      case 'reduce_price_to_match':
        return currentMultiplier * 0.95; // Reduce by 5%
      
      case 'increase_price_5_10_percent':
        return currentMultiplier * (1 + (Math.random() * 0.05 + 0.05)); // 5-10% increase
      
      case 'reduce_price_15_25_percent':
        return currentMultiplier * (1 - (Math.random() * 0.1 + 0.15)); // 15-25% decrease
      
      case 'increase_price_3_7_percent':
        return currentMultiplier * (1 + (Math.random() * 0.04 + 0.03)); // 3-7% increase
      
      case 'adjust_price_based_on_trend':
        return currentMultiplier * (1 + (factors.marketPotential - 0.5) * 0.2); // Adjust based on trend
      
      default:
        return currentMultiplier;
    }
  }

  /**
   * Calculate AI-based price adjustment
   */
  private async calculateAIPriceAdjustment(factors: PricingOptimization['factors']): Promise<number> {
    // Use neural network for price adjustment if available
    // For now, use weighted average of factors
    const weights = {
      competitorPricing: 0.25,
      demandForecast: 0.25,
      marketPotential: 0.20,
      competitionLevel: 0.15,
      seasonality: 0.10,
      inventoryLevel: 0.05,
    };

    const adjustment = 
      (factors.competitorPricing * weights.competitorPricing) +
      (factors.demandForecast * weights.demandForecast) +
      (factors.marketPotential * weights.marketPotential) +
      ((1 - factors.competitionLevel) * weights.competitionLevel) +
      (factors.seasonality * weights.seasonality) +
      (factors.inventoryLevel * weights.inventoryLevel);

    return 0.8 + (adjustment * 0.4); // Map to 0.8-1.2 range
  }

  /**
   * Apply psychological pricing
   */
  private applyPsychologicalPricing(price: number): number {
    if (price < 10) {
      return Math.ceil(price);
    } else if (price < 100) {
      return Math.floor(price) - 0.01; // $XX.99
    } else {
      return Math.floor(price) - 0.01; // $XXX.99
    }
  }

  /**
   * Get current product price
   */
  private async getCurrentPrice(productId: string): Promise<number | null> {
    try {
      const result = await query(
        'SELECT retail_price FROM products WHERE shopify_id = $1',
        [productId]
      );

      return result.rows[0]?.retail_price ? parseFloat(result.rows[0].retail_price) : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get wholesale price
   */
  private async getWholesalePrice(productId: string): Promise<number | null> {
    try {
      const result = await query(
        'SELECT wholesale_price FROM products WHERE shopify_id = $1',
        [productId]
      );

      return result.rows[0]?.wholesale_price ? parseFloat(result.rows[0].wholesale_price) : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate pricing reasoning
   */
  private async generatePricingReasoning(factors: PricingOptimization['factors'], priceChange: number): Promise<string[]> {
    const reasoning: string[] = [];

    if (factors.competitorPricing < 0.8) {
      reasoning.push('Competitors are pricing significantly lower');
    } else if (factors.competitorPricing > 1.2) {
      reasoning.push('Pricing above competitors suggests premium positioning opportunity');
    }

    if (factors.demandForecast > 0.8) {
      reasoning.push('High demand forecast supports price increase');
    } else if (factors.demandForecast < 0.3) {
      reasoning.push('Low demand forecast suggests price sensitivity');
    }

    if (factors.marketPotential > 0.8) {
      reasoning.push('Strong market potential supports premium pricing');
    }

    if (factors.competitionLevel < 0.3) {
      reasoning.push('Low competition level allows for pricing flexibility');
    } else if (factors.competitionLevel > 0.7) {
      reasoning.push('High competition requires competitive pricing');
    }

    if (factors.seasonality > 1.1) {
      reasoning.push('Seasonal demand supports price increase');
    } else if (factors.seasonality < 0.9) {
      reasoning.push('Off-season period suggests promotional pricing');
    }

    if (factors.inventoryLevel < 0.2) {
      reasoning.push('Low inventory level may require clearance pricing');
    } else if (factors.inventoryLevel > 0.8) {
      reasoning.push('High inventory level supports aggressive pricing');
    }

    return reasoning;
  }

  /**
   * Determine implementation strategy
   */
  private determineImplementationStrategy(priceChange: number, factors: PricingOptimization['factors']): 'immediate' | 'gradual' | 'test' {
    const changePercentage = Math.abs(priceChange / await this.getCurrentPrice('') || 1);

    if (changePercentage > 0.15) {
      return 'test'; // Test large changes
    } else if (changePercentage > 0.05) {
      return 'gradual'; // Gradual implementation for moderate changes
    } else {
      return 'immediate'; // Immediate for small changes
    }
  }

  /**
   * Calculate expected impact
   */
  private async calculateExpectedImpact(productId: string, currentPrice: number, newPrice: number, factors: PricingOptimization['factors']): Promise<PricingOptimization['expectedImpact']> {
    // Simplified impact calculation
    const priceChange = (newPrice - currentPrice) / currentPrice;
    
    // Price elasticity assumptions
    const elasticity = -1.5; // 1% price increase = 1.5% volume decrease
    const volumeChange = priceChange * elasticity;
    
    // Revenue change
    const revenueChange = (1 + priceChange) * (1 + volumeChange) - 1;
    
    // Margin change (simplified)
    const wholesalePrice = await this.getWholesalePrice(productId) || (currentPrice * 0.6);
    const currentMargin = (currentPrice - wholesalePrice) / currentPrice;
    const newMargin = (newPrice - wholesalePrice) / newPrice;
    const marginChange = newMargin - currentMargin;

    return {
      revenueChange: revenueChange * 100, // Percentage
      volumeChange: volumeChange * 100, // Percentage
      marginChange: marginChange * 100, // Percentage
    };
  }

  /**
   * Calculate confidence in pricing recommendation
   */
  private calculatePricingConfidence(factors: PricingOptimization['factors']): number {
    // Higher confidence when factors are aligned
    const factorAlignment = 
      (factors.demandForecast > 0.5 ? 1 : 0) +
      (factors.marketPotential > 0.5 ? 1 : 0) +
      (factors.competitionLevel < 0.5 ? 1 : 0);

    return Math.min(0.5 + (factorAlignment / 6), 0.95);
  }

  /**
   * Apply pricing optimization
   */
  private async applyPricingOptimization(optimization: PricingOptimization): Promise<void> {
    try {
      // Store pricing history
      await query(
        `INSERT INTO pricing_history (product_id, price, competitor_price, recommended_price, price_change, change_reason, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          optimization.productId,
          optimization.currentPrice,
          await this.getAverageCompetitorPrice(optimization.productId),
          optimization.recommendedPrice,
          optimization.changePercentage,
          optimization.reasoning.join('; '),
          'ai_pricing_optimization',
        ]
      );

      // In production, would actually update the price in Shopify
      logger.info(`Pricing optimization applied for product ${optimization.productId}`, {
        oldPrice: optimization.currentPrice,
        newPrice: optimization.recommendedPrice,
        strategy: optimization.implementationStrategy,
      });
    } catch (error) {
      logger.error(`Failed to apply pricing optimization for ${optimization.productId}`, error);
    }
  }

  /**
   * Get average competitor price
   */
  private async getAverageCompetitorPrice(productId: string): Promise<number> {
    try {
      const productData = await query(
        'SELECT title FROM products WHERE shopify_id = $1',
        [productId]
      );

      if (productData.rows.length === 0) return 0;

      const competitorPrices = await competitorMonitoringService.getCompetitorPricing(productData.rows[0].title);

      if (competitorPrices.length === 0) return 0;

      return competitorPrices.reduce((sum, p) => sum + parseFloat(p.price), 0) / competitorPrices.length;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Add custom pricing rule
   */
  addPricingRule(rule: PricingRule): void {
    this.pricingRules.push(rule);
    logger.info(`Added custom pricing rule: ${rule.name}`);
  }

  /**
   * Remove pricing rule
   */
  removePricingRule(ruleId: string): void {
    this.pricingRules = this.pricingRules.filter(r => r.id !== ruleId);
    logger.info(`Removed pricing rule: ${ruleId}`);
  }

  /**
   * Get pricing analytics
   */
  async getPricingAnalytics(days: number = 30): Promise<any> {
    try {
      const result = await query(
        `SELECT 
           COUNT(*) as total_changes,
           AVG(ABS(price_change)) as avg_change,
           SUM(CASE WHEN price_change > 0 THEN 1 ELSE 0 END) as increases,
           SUM(CASE WHEN price_change < 0 THEN 1 ELSE 0 END) as decreases,
           source,
           DATE(created_at) as date
         FROM pricing_history
         WHERE created_at > NOW() - INTERVAL '${days} days'
         GROUP BY source, DATE(created_at)
         ORDER BY date DESC`
      );

      return {
        summary: {
          totalChanges: parseInt(result.rows[0]?.total_changes || 0),
          averageChange: parseFloat(result.rows[0]?.avg_change || 0),
          priceIncreases: parseInt(result.rows[0]?.increases || 0),
          priceDecreases: parseInt(result.rows[0]?.decreases || 0),
        },
        bySource: result.rows.reduce((acc: any, row) => {
          if (!acc[row.source]) {
            acc[row.source] = { count: 0, avgChange: 0 };
          }
          acc[row.source].count++;
          acc[row.source].avgChange += Math.abs(row.price_change);
          return acc;
        }, {}),
        timeline: result.rows,
      };
    } catch (error) {
      logger.error('Failed to get pricing analytics', error);
      return null;
    }
  }
}

export const pricingOptimizationService = new PricingOptimizationService();