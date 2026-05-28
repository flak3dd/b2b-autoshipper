import { logger } from '../utils/logger';
import { query } from '../db/connection';
import { aiProductResearchService } from './aiProductResearchService';
import { predictiveAnalyticsService } from './predictiveAnalyticsService';
import { monitoringService } from '../utils/monitoring';

interface Opportunity {
  id?: number;
  opportunityType: 'product_gap' | 'pricing_opportunity' | 'market_underserved' | 'trending_niche' | 'competitor_weakness';
  title: string;
  description: string;
  category: string;
  potentialRevenue: number;
  investmentRequired: number;
  riskLevel: 'low' | 'medium' | 'high';
  timeToMarket: number; // days
  confidence: number;
  keywords: string[];
  dataSources: string[];
  actionableSteps: string[];
  status: 'pending' | 'investigating' | 'approved' | 'rejected';
}

interface MarketGap {
  category: string;
  missingProducts: string[];
  demandLevel: number;
  competitionLevel: number;
  opportunityScore: number;
}

class OpportunityDetectionService {
  private detectionInterval: NodeJS.Timeout | null = null;

  /**
   * Start automated opportunity detection
   */
  startDetection(intervalHours: number = 6): void {
    if (this.detectionInterval) {
      logger.warn('Opportunity detection is already running');
      return;
    }

    logger.info(`Starting automated opportunity detection with ${intervalHours} hour intervals`);

    // Initial scan
    this.runDetectionCycle();

    // Schedule regular detection
    this.detectionInterval = setInterval(() => {
      this.runDetectionCycle();
    }, intervalHours * 60 * 60 * 1000);
  }

  /**
   * Stop opportunity detection
   */
  stopDetection(): void {
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
      logger.info('Opportunity detection stopped');
    }
  }

  /**
   * Run complete opportunity detection cycle
   */
  private async runDetectionCycle(): Promise<void> {
    try {
      logger.info('Starting opportunity detection cycle');

      const opportunities: Opportunity[] = [];

      // Detect product gaps
      const productGaps = await this.detectProductGaps();
      opportunities.push(...productGaps);

      // Detect pricing opportunities
      const pricingOpportunities = await this.detectPricingOpportunities();
      opportunities.push(...pricingOpportunities);

      // Detect underserved markets
      const underservedMarkets = await this.detectUnderservedMarkets();
      opportunities.push(...underservedMarkets);

      // Detect trending niches
      const trendingNiches = await this.detectTrendingNiches();
      opportunities.push(...trendingNiches);

      // Detect competitor weaknesses
      const competitorWeaknesses = await this.detectCompetitorWeaknesses();
      opportunities.push(...competitorWeaknesses);

      // Filter and prioritize opportunities
      const prioritizedOpportunities = this.prioritizeOpportunities(opportunities);

      // Store opportunities in database
      for (const opportunity of prioritizedOpportunities) {
        await this.storeOpportunity(opportunity);
      }

      // Send alerts for high-confidence opportunities
      const highConfidenceOpportunities = prioritizedOpportunities.filter(o => o.confidence > 0.8);
      if (highConfidenceOpportunities.length > 0) {
        await this.sendOpportunityAlerts(highConfidenceOpportunities);
      }

      logger.info(`Opportunity detection cycle completed: ${prioritizedOpportunities.length} opportunities detected`);
    } catch (error) {
      logger.error('Opportunity detection cycle failed', error);
    }
  }

  /**
   * Detect product gaps in the market
   */
  private async detectProductGaps(): Promise<Opportunity[]> {
    const opportunities: Opportunity[] = [];

    try {
      // Analyze market demand vs current product offerings
      const result = await query(
        `SELECT 
           category,
           COUNT(*) as product_count,
           AVG(market_potential) as avg_potential,
           AVG(competition_level) as avg_competition
         FROM product_research
         WHERE updated_at > NOW() - INTERVAL '30 days'
         GROUP BY category
         ORDER BY avg_potential DESC`
      );

      for (const row of result.rows) {
        const gapScore = row.avg_potential * (1 - row.avg_competition);
        
        if (gapScore > 0.6 && row.product_count < 20) {
          opportunities.push({
            opportunityType: 'product_gap',
            title: `Product gap in ${row.category}`,
            description: `High market potential (${(row.avg_potential * 100).toFixed(0)}%) with low competition (${(row.avg_competition * 100).toFixed(0)}%) and limited product offerings (${row.product_count} products)`,
            category: row.category,
            potentialRevenue: this.calculatePotentialRevenue(row.avg_potential, row.product_count),
            investmentRequired: 5000,
            riskLevel: row.avg_competition > 0.5 ? 'medium' : 'low',
            timeToMarket: 14,
            confidence: gapScore,
            keywords: await this.getCategoryKeywords(row.category),
            dataSources: ['product_research', 'market_analysis'],
            actionableSteps: [
              'Research top products in this category',
              'Identify potential suppliers',
              'Analyze competitor pricing',
              'Develop product differentiation strategy',
            ],
            status: 'pending',
          });
        }
      }
    } catch (error) {
      logger.error('Failed to detect product gaps', error);
    }

    return opportunities;
  }

  /**
   * Detect pricing opportunities
   */
  private async detectPricingOpportunities(): Promise<Opportunity[]> {
    const opportunities: Opportunity[] = [];

    try {
      // Find products where our pricing is significantly different from market
      const result = await query(
        `SELECT 
           pr.product_id,
           pr.title,
           pr.recommended_price,
           p.retail_price,
           pr.market_potential,
           pr.competition_level
         FROM product_research pr
         JOIN products p ON pr.product_id = p.shopify_id
         WHERE pr.updated_at > NOW() - INTERVAL '7 days'
         AND pr.confidence > 0.7`
      );

      for (const row of result.rows) {
        const priceDifference = Math.abs((row.recommended_price - row.retail_price) / row.retail_price);
        
        if (priceDifference > 0.15) { // 15% difference
          const isUnderpriced = row.recommended_price > row.retail_price;
          
          opportunities.push({
            opportunityType: 'pricing_opportunity',
            title: `Pricing ${isUnderpriced ? 'increase' : 'decrease'} opportunity: ${row.title.substring(0, 50)}...`,
            description: `Current price $${row.retail_price.toFixed(2)} differs from recommended $${row.recommended_price.toFixed(2)} by ${(priceDifference * 100).toFixed(0)}%`,
            category: 'pricing',
            potentialRevenue: isUnderpriced ? 
              (row.recommended_price - row.retail_price) * 100 : // Assume 100 units
              (row.retail_price - row.recommended_price) * 100, // Volume increase
            investmentRequired: 0,
            riskLevel: 'low',
            timeToMarket: 1,
            confidence: Math.min(priceDifference * 2, 0.95),
            keywords: ['pricing', 'optimization', isUnderpriced ? 'increase' : 'decrease'],
            dataSources: ['product_research', 'pricing_history'],
            actionableSteps: [
              isUnderpriced ? 'Gradually increase price' : 'Consider price reduction',
              'Monitor competitor responses',
              'Analyze impact on sales volume',
              'A/B test new price point',
            ],
            status: 'pending',
          });
        }
      }
    } catch (error) {
      logger.error('Failed to detect pricing opportunities', error);
    }

    return opportunities;
  }

  /**
   * Detect underserved markets
   */
  private async detectUnderservedMarkets(): Promise<Opportunity[]> {
    const opportunities: Opportunity[] = [];

    try {
      // Analyze market trends vs product offerings
      const trends = await predictiveAnalyticsService.predictMarketTrends();

      for (const trend of trends) {
        // Check if we have products in this trending category
        const productCount = await query(
          `SELECT COUNT(*) as count 
           FROM product_research 
           WHERE category = $1 
           AND updated_at > NOW() - INTERVAL '30 days'`,
          [trend.category]
        );

        const count = productCount.rows[0]?.count || 0;
        
        if (trend.predictedGrowth > 0.2 && count < 10) {
          opportunities.push({
            opportunityType: 'market_underserved',
            title: `Underserved market: ${trend.category}`,
            description: `${trend.trend} showing ${trend.predictedGrowth.toFixed(0)}% predicted growth with limited current offerings (${count} products)`,
            category: trend.category,
            potentialRevenue: trend.predictedGrowth * 100000, // Estimated
            investmentRequired: 10000,
            riskLevel: trend.confidence > 0.8 ? 'low' : 'medium',
            timeToMarket: 21,
            confidence: trend.confidence * (1 - count / 20),
            keywords: trend.keyDrivers,
            dataSources: ['market_trends', 'predictive_analytics'],
            actionableSteps: [
              'Research trending products in this category',
              'Identify key suppliers',
              'Develop marketing strategy',
              'Create product differentiation',
            ],
            status: 'pending',
          });
        }
      }
    } catch (error) {
      logger.error('Failed to detect underserved markets', error);
    }

    return opportunities;
  }

  /**
   * Detect trending niches
   */
  private async detectTrendingNiches(): Promise<Opportunity[]> {
    const opportunities: Opportunity[] = [];

    try {
      // Analyze search trends and social media signals
      const result = await query(
        `SELECT 
           keyword,
           AVG(search_volume) as avg_volume,
           COUNT(*) as occurrences,
           MAX(timestamp) as latest_timestamp
         FROM search_trends
         WHERE timestamp > NOW() - INTERVAL '30 days'
         GROUP BY keyword
         HAVING COUNT(*) > 5
         ORDER BY avg_volume DESC
         LIMIT 20`
      );

      for (const row of result.rows) {
        // Check if we have products for this keyword
        const productMatch = await query(
          `SELECT COUNT(*) as count 
           FROM product_research 
           WHERE tags @> $1`,
          [JSON.stringify([row.keyword])]
        );

        const count = productMatch.rows[0]?.count || 0;
        
        if (row.avg_volume > 1000 && count < 5) {
          opportunities.push({
            opportunityType: 'trending_niche',
            title: `Trending niche: ${row.keyword}`,
            description: `Keyword "${row.keyword}" showing high search volume (${row.avg_volume}) with limited product coverage (${count} products)`,
            category: 'trending',
            potentialRevenue: row.avg_volume * 10, // Estimated
            investmentRequired: 3000,
            riskLevel: 'medium',
            timeToMarket: 7,
            confidence: Math.min(row.avg_volume / 5000, 0.9),
            keywords: [row.keyword],
            dataSources: ['search_trends', 'social_media'],
            actionableSteps: [
              'Research products related to this keyword',
              'Analyze search intent',
              'Identify target customer segments',
              'Develop SEO strategy',
            ],
            status: 'pending',
          });
        }
      }
    } catch (error) {
      logger.error('Failed to detect trending niches', error);
    }

    return opportunities;
  }

  /**
   * Detect competitor weaknesses
   */
  private async detectCompetitorWeaknesses(): Promise<Opportunity[]> {
    const opportunities: Opportunity[] = [];

    try {
      // Analyze competitor performance gaps
      const result = await query(
        `SELECT 
           ca.competitor_name,
           ca.market_share,
           ca.pricing_strategy,
           ca.product_count,
           ca.strengths,
           ca.weaknesses,
           ca.opportunities
         FROM competitor_analysis ca
         WHERE ca.last_analyzed > NOW() - INTERVAL '7 days'`
      );

      for (const row of result.rows) {
        const weaknesses = row.weaknesses || [];
        
        if (weaknesses.length > 0) {
          for (const weakness of weaknesses) {
            opportunities.push({
              opportunityType: 'competitor_weakness',
              title: `Competitor weakness: ${row.competitor_name} - ${weakness}`,
              description: `${row.competitor_name} has identified weakness: "${weakness}" with ${row.market_share.toFixed(1)}% market share`,
              category: 'competitive',
              potentialRevenue: row.market_share * 50000, // Estimated based on market share
              investmentRequired: 2000,
              riskLevel: 'low',
              timeToMarket: 10,
              confidence: 0.7,
              keywords: ['competitor', 'weakness', row.competitor_name.toLowerCase()],
              dataSources: ['competitor_analysis'],
              actionableSteps: [
                'Develop strategy to exploit this weakness',
                'Target affected customer segments',
                'Create marketing messaging around this gap',
                'Monitor competitor response',
              ],
              status: 'pending',
            });
          }
        }
      }
    } catch (error) {
      logger.error('Failed to detect competitor weaknesses', error);
    }

    return opportunities;
  }

  /**
   * Calculate potential revenue for an opportunity
   */
  private calculatePotentialRevenue(marketPotential: number, productCount: number): number {
    // Simplified revenue calculation
    const baseRevenue = 50000; // Base revenue potential
    const marketMultiplier = marketPotential * 2;
    const competitionDampener = 1 - (productCount / 100); // Fewer products = higher potential
    
    return Math.round(baseRevenue * marketMultiplier * competitionDampener);
  }

  /**
   * Get keywords for a category
   */
  private async getCategoryKeywords(category: string): Promise<string[]> {
    try {
      const result = await query(
        `SELECT DISTINCT unnest(tags) as keyword 
         FROM product_research 
         WHERE category = $1 
         LIMIT 10`,
        [category]
      );

      return result.rows.map(row => row.keyword);
    } catch (error) {
      return [category.toLowerCase()];
    }
  }

  /**
   * Prioritize opportunities based on multiple factors
   */
  private prioritizeOpportunities(opportunities: Opportunity[]): Opportunity[] {
    return opportunities
      .map(opp => ({
        ...opp,
        priorityScore: this.calculatePriorityScore(opp),
      }))
      .sort((a, b) => b.priorityScore - a.priorityScore);
  }

  /**
   * Calculate priority score for an opportunity
   */
  private calculatePriorityScore(opportunity: Opportunity): number {
    const weights = {
      confidence: 0.4,
      potentialRevenue: 0.3,
      riskLevel: 0.2,
      timeToMarket: 0.1,
    };

    const riskScore = opportunity.riskLevel === 'low' ? 1 : 
                     opportunity.riskLevel === 'medium' ? 0.6 : 0.3;
    
    const timeScore = Math.max(0, 1 - (opportunity.timeToMarket / 30)); // Normalize to 0-1
    const revenueScore = Math.min(opportunity.potentialRevenue / 100000, 1);

    return (
      (opportunity.confidence * weights.confidence) +
      (revenueScore * weights.potentialRevenue) +
      (riskScore * weights.riskLevel) +
      (timeScore * weights.timeToMarket)
    );
  }

  /**
   * Store opportunity in database
   */
  private async storeOpportunity(opportunity: Opportunity): Promise<void> {
    try {
      await query(
        `INSERT INTO market_opportunities 
         (opportunity_type, title, description, category, potential_revenue, 
          investment_required, risk_level, time_to_market, confidence, 
          keywords, data_sources, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (title, category) 
         DO UPDATE SET
           confidence = EXCLUDED.confidence,
           potential_revenue = EXCLUDED.potential_revenue,
           updated_at = NOW()`,
        [
          opportunity.opportunityType,
          opportunity.title,
          opportunity.description,
          opportunity.category,
          opportunity.potentialRevenue,
          opportunity.investmentRequired,
          opportunity.riskLevel,
          opportunity.timeToMarket,
          opportunity.confidence,
          JSON.stringify(opportunity.keywords),
          JSON.stringify(opportunity.dataSources),
          opportunity.status,
        ]
      );
    } catch (error) {
      logger.error('Failed to store opportunity', error);
    }
  }

  /**
   * Send alerts for high-confidence opportunities
   */
  private async sendOpportunityAlerts(opportunities: Opportunity[]): Promise<void> {
    try {
      for (const opportunity of opportunities) {
        await monitoringService.alertError(
          new Error(`High-confidence opportunity detected: ${opportunity.title}`),
          {
            opportunityType: opportunity.opportunityType,
            category: opportunity.category,
            confidence: opportunity.confidence,
            potentialRevenue: opportunity.potentialRevenue,
            riskLevel: opportunity.riskLevel,
            actionableSteps: opportunity.actionableSteps,
          }
        );
      }

      logger.info(`Sent alerts for ${opportunities.length} high-confidence opportunities`);
    } catch (error) {
      logger.error('Failed to send opportunity alerts', error);
    }
  }

  /**
   * Get pending opportunities
   */
  async getPendingOpportunities(limit: number = 20): Promise<Opportunity[]> {
    try {
      const result = await query(
        `SELECT * FROM market_opportunities 
         WHERE status = 'pending' 
         ORDER BY confidence DESC, potential_revenue DESC 
         LIMIT $1`,
        [limit]
      );

      return result.rows.map(row => ({
        id: row.id,
        opportunityType: row.opportunity_type,
        title: row.title,
        description: row.description,
        category: row.category,
        potentialRevenue: parseFloat(row.potential_revenue),
        investmentRequired: parseFloat(row.investment_required),
        riskLevel: row.risk_level,
        timeToMarket: row.time_to_market,
        confidence: parseFloat(row.confidence),
        keywords: row.keywords,
        dataSources: row.data_sources,
        actionableSteps: [], // Would need to be stored separately
        status: row.status,
      }));
    } catch (error) {
      logger.error('Failed to get pending opportunities', error);
      return [];
    }
  }

  /**
   * Update opportunity status
   */
  async updateOpportunityStatus(opportunityId: number, status: Opportunity['status']): Promise<void> {
    try {
      await query(
        `UPDATE market_opportunities 
         SET status = $1, updated_at = NOW() 
         WHERE id = $2`,
        [status, opportunityId]
      );

      logger.info(`Updated opportunity ${opportunityId} status to ${status}`);
    } catch (error) {
      logger.error('Failed to update opportunity status', error);
    }
  }

  /**
   * Analyze specific product for opportunities
   */
  async analyzeProductOpportunities(productId: string): Promise<Opportunity[]> {
    try {
      const productResearch = await aiProductResearchService.analyzeProduct({ id: productId });
      const demandForecast = await predictiveAnalyticsService.generateDemandForecast(productId);
      
      const opportunities: Opportunity[] = [];

      // Check if product has high potential but low visibility
      if (productResearch.marketPotential > 0.7 && productResearch.competitionLevel < 0.5) {
        opportunities.push({
          opportunityType: 'product_gap',
          title: `High-potential product: ${productResearch.title}`,
          description: `Product shows high market potential (${(productResearch.marketPotential * 100).toFixed(0)}%) with low competition (${(productResearch.competitionLevel * 100).toFixed(0)}%)`,
          category: productResearch.category,
          potentialRevenue: productResearch.recommendedPrice * demandForecast.predictedDemand,
          investmentRequired: 1000,
          riskLevel: 'low',
          timeToMarket: 7,
          confidence: productResearch.confidence,
          keywords: productResearch.tags,
          dataSources: ['product_research', 'demand_forecast'],
          actionableSteps: [
            'Increase marketing efforts',
            'Optimize product listing',
            'Consider pricing adjustment',
            'Expand to new channels',
          ],
          status: 'pending',
        });
      }

      // Check pricing opportunity
      const currentPrice = await this.getCurrentProductPrice(productId);
      if (currentPrice && Math.abs(currentPrice - productResearch.recommendedPrice) / currentPrice > 0.1) {
        opportunities.push({
          opportunityType: 'pricing_opportunity',
          title: `Pricing optimization for ${productResearch.title}`,
          description: `Current price $${currentPrice.toFixed(2)} vs recommended $${productResearch.recommendedPrice.toFixed(2)}`,
          category: productResearch.category,
          potentialRevenue: Math.abs(productResearch.recommendedPrice - currentPrice) * demandForecast.predictedDemand,
          investmentRequired: 0,
          riskLevel: 'low',
          timeToMarket: 1,
          confidence: productResearch.confidence * 0.9,
          keywords: ['pricing', 'optimization'],
          dataSources: ['product_research'],
          actionableSteps: [
            'Analyze price elasticity',
            'Test new price point',
            'Monitor competitor response',
            'Communicate change to customers',
          ],
          status: 'pending',
        });
      }

      return opportunities;
    } catch (error) {
      logger.error(`Failed to analyze opportunities for product ${productId}`, error);
      return [];
    }
  }

  /**
   * Get current product price
   */
  private async getCurrentProductPrice(productId: string): Promise<number | null> {
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
}

export const opportunityDetectionService = new OpportunityDetectionService();