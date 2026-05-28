import { logger } from '../utils/logger';
import { query } from '../db/connection';
// import * as brain from 'brain.js'; // Temporarily disabled for Vercel deployment

interface DemandForecast {
  productId: string;
  forecastPeriod: string;
  predictedDemand: number;
  confidence: number;
  factors: {
    seasonality: number;
    trend: number;
    competition: number;
    marketSentiment: number;
    historicalPerformance: number;
  };
  riskLevel: 'low' | 'medium' | 'high';
}

interface TrendPrediction {
  category: string;
  trend: string;
  predictedGrowth: number;
  timeframe: string;
  confidence: number;
  keyDrivers: string[];
  relatedCategories: string[];
}

interface MarketSignal {
  type: 'price' | 'demand' | 'competition' | 'sentiment';
  strength: number;
  direction: 'up' | 'down' | 'stable';
  description: string;
  actionable: boolean;
}

class PredictiveAnalyticsService {
  // private neuralNetwork: brain.NeuralNetwork | null = null;
  private neuralNetwork: any = null;
  private modelInitialized = false;

  constructor() {
    this.initializeNeuralNetwork();
  }

  /**
   * Initialize neural network for predictions
   */
  private initializeNeuralNetwork(): void {
    try {
      // Temporarily disabled brain.js for Vercel deployment
      // TODO: Re-enable when native dependency issue is resolved
      logger.info('Neural network initialization disabled for deployment compatibility');
      this.modelInitialized = false;
      return;

      // Create a simple neural network for demand prediction
      // this.neuralNetwork = new brain.NeuralNetwork({
      //   hiddenLayers: [10, 8],
      //   activation: 'sigmoid',
      // });

      // // Train with sample data (in production, would use historical data)
      // const trainingData = this.generateSampleTrainingData();
      // this.neuralNetwork.train(trainingData, {
      //   iterations: 1000,
      //   errorThresh: 0.01,
      // });

      // this.modelInitialized = true;
      logger.info('Neural network initialized for predictive analytics');
    } catch (error) {
      logger.error('Failed to initialize neural network', error);
      this.modelInitialized = false;
    }
  }

  /**
   * Generate sample training data for the neural network
   */
  private generateSampleTrainingData(): any[] {
    return [
      { input: { seasonality: 0.5, trend: 0.3, competition: 0.4, sentiment: 0.6 }, output: { demand: 0.5 } },
      { input: { seasonality: 0.8, trend: 0.7, competition: 0.3, sentiment: 0.8 }, output: { demand: 0.8 } },
      { input: { seasonality: 0.2, trend: 0.1, competition: 0.8, sentiment: 0.3 }, output: { demand: 0.2 } },
      { input: { seasonality: 0.6, trend: 0.5, competition: 0.5, sentiment: 0.5 }, output: { demand: 0.5 } },
      { input: { seasonality: 0.9, trend: 0.8, competition: 0.2, sentiment: 0.9 }, output: { demand: 0.9 } },
    ];
  }

  /**
   * Generate demand forecast for a product
   */
  async generateDemandForecast(productId: string, period: string = '30d'): Promise<DemandForecast> {
    try {
      logger.info(`Generating demand forecast for product ${productId} (${period})`);

      // Gather input factors
      const factors = await this.gatherDemandFactors(productId);
      
      // Use neural network if available, otherwise use rule-based approach
      let predictedDemand: number;
      let confidence: number;

      if (this.modelInitialized && this.neuralNetwork) {
        const input = {
          seasonality: factors.seasonality,
          trend: factors.trend,
          competition: factors.competition,
          sentiment: factors.marketSentiment,
        };

        const output = this.neuralNetwork.run(input) as { demand: number };
        predictedDemand = Math.round(output.demand * 100); // Scale to realistic demand numbers
        confidence = 0.85; // Neural network confidence
      } else {
        // Rule-based fallback
        predictedDemand = this.calculateDemandRuleBased(factors);
        confidence = 0.75; // Lower confidence for rule-based
      }

      // Adjust for historical performance
      const historicalAdjustment = await this.getHistoricalAdjustment(productId);
      predictedDemand = Math.round(predictedDemand * (1 + historicalAdjustment));

      // Determine risk level
      const riskLevel = this.calculateRiskLevel(factors, confidence);

      const forecast: DemandForecast = {
        productId,
        forecastPeriod: period,
        predictedDemand,
        confidence,
        factors,
        riskLevel,
      };

      // Store forecast in database
      await this.storeForecast(forecast);

      logger.info(`Demand forecast generated for ${productId}`, {
        predictedDemand,
        confidence,
        riskLevel,
      });

      return forecast;
    } catch (error) {
      logger.error(`Failed to generate demand forecast for ${productId}`, error);
      throw error;
    }
  }

  /**
   * Gather factors influencing demand
   */
  private async gatherDemandFactors(productId: string): Promise<DemandForecast['factors']> {
    // Get product research data
    const researchResult = await query(
      'SELECT market_potential, competition_level, trend_score FROM product_research WHERE product_id = $1',
      [productId]
    );

    const research = researchResult.rows[0] || { market_potential: 0.5, competition_level: 0.5, trend_score: 0.5 };

    // Calculate seasonality (simplified - in production, would use historical data)
    const currentMonth = new Date().getMonth();
    const seasonality = this.calculateSeasonality(currentMonth);

    // Calculate trend based on research data
    const trend = research.trend_score;

    // Competition level (inverse - higher competition = lower factor)
    const competition = 1 - research.competition_level;

    // Market sentiment (from research)
    const marketSentiment = research.market_potential;

    // Historical performance
    const historicalPerformance = await this.getHistoricalPerformance(productId);

    return {
      seasonality,
      trend,
      competition,
      marketSentiment,
      historicalPerformance,
    };
  }

  /**
   * Calculate seasonality factor based on month
   */
  private calculateSeasonality(month: number): number {
    // Simplified seasonality patterns
    const seasonalPatterns = {
      0: 0.8,  // January - post-holiday dip
      1: 0.7,  // February
      2: 0.75, // March
      3: 0.85, // April - spring
      4: 0.9,  // May
      5: 0.95, // June - summer start
      6: 0.9,  // July
      7: 0.85, // August
      8: 0.9,  // September - back to school
      9: 1.0,  // October
      10: 1.1, // November - pre-holiday
      11: 1.2, // December - holiday peak
    };

    return seasonalPatterns[month as keyof typeof seasonalPatterns] || 1.0;
  }

  /**
   * Calculate demand using rule-based approach
   */
  private calculateDemandRuleBased(factors: DemandForecast['factors']): number {
    const weights = {
      seasonality: 0.25,
      trend: 0.25,
      competition: 0.2,
      marketSentiment: 0.2,
      historicalPerformance: 0.1,
    };

    const weightedScore =
      (factors.seasonality * weights.seasonality) +
      (factors.trend * weights.trend) +
      (factors.competition * weights.competition) +
      (factors.marketSentiment * weights.marketSentiment) +
      (factors.historicalPerformance * weights.historicalPerformance);

    return Math.round(weightedScore * 100); // Scale to 0-100 range
  }

  /**
   * Get historical performance adjustment
   */
  private async getHistoricalPerformance(productId: string): Promise<number> {
    try {
      const result = await query(
        `SELECT 
           COALESCE(AVG(sales_count), 0) as avg_sales,
           COALESCE(STDDEV(sales_count), 0) as sales_stddev
         FROM products 
         WHERE shopify_id = $1`,
        [productId]
      );

      if (result.rows.length > 0 && result.rows[0].avg_sales > 0) {
        // Positive adjustment if above average performance
        return (result.rows[0].avg_sales - 50) / 100; // Normalize around 50
      }

      return 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Calculate risk level
   */
  private calculateRiskLevel(factors: DemandForecast['factors'], confidence: number): 'low' | 'medium' | 'high' {
    const riskScore = 
      (1 - factors.seasonality) * 0.2 +
      (1 - factors.trend) * 0.2 +
      factors.competition * 0.3 +
      (1 - factors.marketSentiment) * 0.2 +
      (1 - confidence) * 0.1;

    if (riskScore < 0.3) return 'low';
    if (riskScore < 0.6) return 'medium';
    return 'high';
  }

  /**
   * Store forecast in database
   */
  private async storeForecast(forecast: DemandForecast): Promise<void> {
    try {
      await query(
        `INSERT INTO demand_forecasts (product_id, forecast_type, forecast_period, 
         predicted_demand, confidence, factors, risk_level, model_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          forecast.productId,
          'demand',
          forecast.forecastPeriod,
          forecast.predictedDemand,
          forecast.confidence,
          JSON.stringify(forecast.factors),
          forecast.riskLevel,
          this.modelInitialized ? 'neural-network-v1' : 'rule-based-v1',
        ]
      );
    } catch (error) {
      logger.error('Failed to store forecast', error);
    }
  }

  /**
   * Predict market trends
   */
  async predictMarketTrends(category?: string): Promise<TrendPrediction[]> {
    try {
      logger.info(`Predicting market trends${category ? ` for category: ${category}` : ''}`);

      // Get historical trend data
      const trendData = await this.getHistoricalTrendData(category);

      // Analyze trend patterns
      const predictions: TrendPrediction[] = [];

      for (const trend of trendData) {
        const prediction = await this.analyzeTrendPattern(trend);
        predictions.push(prediction);
      }

      // Sort by predicted growth
      predictions.sort((a, b) => b.predictedGrowth - a.predictedGrowth);

      logger.info(`Generated ${predictions.length} trend predictions`);
      return predictions.slice(0, 10); // Return top 10
    } catch (error) {
      logger.error('Failed to predict market trends', error);
      return [];
    }
  }

  /**
   * Get historical trend data
   */
  private async getHistoricalTrendData(category?: string): Promise<any[]> {
    try {
      let queryText = `
        SELECT trend, category, growth_rate, keywords 
        FROM market_trends 
        WHERE created_at > NOW() - INTERVAL '90 days'
      `;
      const params: any[] = [];

      if (category) {
        queryText += ' AND category = $1';
        params.push(category);
      }

      queryText += ' ORDER BY growth_rate DESC LIMIT 20';

      const result = await query(queryText, params);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get historical trend data', error);
      return [];
    }
  }

  /**
   * Analyze trend pattern and make prediction
   */
  private async analyzeTrendPattern(trend: any): Promise<TrendPrediction> {
    // Use neural network if available for trend prediction
    let predictedGrowth: number;
    let confidence: number;

    if (this.modelInitialized && this.neuralNetwork) {
      const input = {
        growth_rate: trend.growth_rate,
        keyword_count: trend.keywords?.length || 0,
      };

      const output = this.neuralNetwork.run(input) as { predicted_growth: number };
      predictedGrowth = output.predicted_growth;
      confidence = 0.8;
    } else {
      // Rule-based prediction
      predictedGrowth = trend.growth_rate * 1.1; // Assume 10% growth continuation
      confidence = 0.7;
    }

    return {
      category: trend.category,
      trend: trend.trend,
      predictedGrowth,
      timeframe: '3 months',
      confidence,
      keyDrivers: trend.keywords?.slice(0, 3) || [],
      relatedCategories: await this.getRelatedCategories(trend.category),
    };
  }

  /**
   * Get related categories
   */
  private async getRelatedCategories(category: string): Promise<string[]> {
    try {
      const result = await query(
        `SELECT DISTINCT category 
         FROM market_trends 
         WHERE category != $1 
         AND created_at > NOW() - INTERVAL '60 days'
         LIMIT 5`,
        [category]
      );

      return result.rows.map(row => row.category);
    } catch (error) {
      return [];
    }
  }

  /**
   * Generate market signals
   */
  async generateMarketSignals(): Promise<MarketSignal[]> {
    try {
      logger.info('Generating market signals');

      const signals: MarketSignal[] = [];

      // Price signals
      const priceSignals = await this.generatePriceSignals();
      signals.push(...priceSignals);

      // Demand signals
      const demandSignals = await this.generateDemandSignals();
      signals.push(...demandSignals);

      // Competition signals
      const competitionSignals = await this.generateCompetitionSignals();
      signals.push(...competitionSignals);

      // Sentiment signals
      const sentimentSignals = await this.generateSentimentSignals();
      signals.push(...sentimentSignals);

      // Sort by strength
      signals.sort((a, b) => b.strength - a.strength);

      logger.info(`Generated ${signals.length} market signals`);
      return signals.slice(0, 15); // Return top 15 signals
    } catch (error) {
      logger.error('Failed to generate market signals', error);
      return [];
    }
  }

  /**
   * Generate price-related signals
   */
  private async generatePriceSignals(): Promise<MarketSignal[]> {
    const signals: MarketSignal[] = [];

    try {
      // Check for significant price changes
      const result = await query(
        `SELECT AVG(ABS(price_change)) as avg_change, 
                COUNT(*) as change_count
         FROM pricing_history 
         WHERE created_at > NOW() - INTERVAL '7 days'`
      );

      const priceData = result.rows[0];
      
      if (priceData.avg_change > 0.1) {
        signals.push({
          type: 'price',
          strength: Math.min(priceData.avg_change, 1),
          direction: priceData.avg_change > 0 ? 'up' : 'down',
          description: `Significant price volatility detected: ${priceData.avg_change.toFixed(2)}% average change`,
          actionable: true,
        });
      }
    } catch (error) {
      logger.error('Failed to generate price signals', error);
    }

    return signals;
  }

  /**
   * Generate demand-related signals
   */
  private async generateDemandSignals(): Promise<MarketSignal[]> {
    const signals: MarketSignal[] = [];

    try {
      // Check demand forecast trends
      const result = await query(
        `SELECT AVG(predicted_demand) as avg_demand,
                AVG(confidence) as avg_confidence,
                COUNT(*) as forecast_count
         FROM demand_forecasts 
         WHERE created_at > NOW() - INTERVAL '7 days'`
      );

      const demandData = result.rows[0];

      if (demandData.avg_demand > 70 && demandData.avg_confidence > 0.8) {
        signals.push({
          type: 'demand',
          strength: demandData.avg_demand / 100,
          direction: 'up',
          description: `Strong demand forecast: ${demandData.avg_demand.toFixed(0)} units with ${demandData.avg_confidence.toFixed(0)}% confidence`,
          actionable: true,
        });
      }
    } catch (error) {
      logger.error('Failed to generate demand signals', error);
    }

    return signals;
  }

  /**
   * Generate competition-related signals
   */
  private async generateCompetitionSignals(): Promise<MarketSignal[]> {
    const signals: MarketSignal[] = [];

    try {
      // Check competitor activity
      const result = await query(
        `SELECT COUNT(*) as new_products
         FROM competitor_products 
         WHERE first_seen > NOW() - INTERVAL '7 days'`
      );

      const competitionData = result.rows[0];

      if (competitionData.new_products > 50) {
        signals.push({
          type: 'competition',
          strength: Math.min(competitionData.new_products / 100, 1),
          direction: 'up',
          description: `High competitor activity: ${competitionData.new_products} new products detected`,
          actionable: true,
        });
      }
    } catch (error) {
      logger.error('Failed to generate competition signals', error);
    }

    return signals;
  }

  /**
   * Generate sentiment-related signals
   */
  private async generateSentimentSignals(): Promise<MarketSignal[]> {
    const signals: MarketSignal[] = [];

    try {
      // Check overall market sentiment
      const result = await query(
        `SELECT AVG(sentiment_score) as avg_sentiment,
                AVG(market_potential) as avg_potential
         FROM product_research 
         WHERE updated_at > NOW() - INTERVAL '7 days'`
      );

      const sentimentData = result.rows[0];

      if (sentimentData.avg_sentiment > 0.3) {
        signals.push({
          type: 'sentiment',
          strength: sentimentData.avg_sentiment,
          direction: 'up',
          description: `Positive market sentiment: ${sentimentData.avg_sentiment.toFixed(2)} score`,
          actionable: true,
        });
      } else if (sentimentData.avg_sentiment < -0.2) {
        signals.push({
          type: 'sentiment',
          strength: Math.abs(sentimentData.avg_sentiment),
          direction: 'down',
          description: `Negative market sentiment: ${sentimentData.avg_sentiment.toFixed(2)} score`,
          actionable: true,
        });
      }
    } catch (error) {
      logger.error('Failed to generate sentiment signals', error);
    }

    return signals;
  }

  /**
   * Batch generate forecasts for multiple products
   */
  async batchGenerateForecasts(productIds: string[]): Promise<DemandForecast[]> {
    logger.info(`Batch generating forecasts for ${productIds.length} products`);

    const forecasts = await Promise.all(
      productIds.map(id => this.generateDemandForecast(id))
    );

    logger.info(`Batch forecast generation completed`);
    return forecasts;
  }

  /**
   * Retrain the neural network with new data
   */
  async retrainModel(): Promise<void> {
    try {
      logger.info('Retraining predictive model');

      // Gather new training data from database
      const trainingData = await this.gatherTrainingData();

      if (this.neuralNetwork && trainingData.length > 0) {
        this.neuralNetwork.train(trainingData, {
          iterations: 500,
          errorThresh: 0.01,
        });

        logger.info('Model retraining completed');
      }
    } catch (error) {
      logger.error('Failed to retrain model', error);
    }
  }

  /**
   * Gather training data from database
   */
  private async gatherTrainingData(): Promise<any[]> {
    try {
      const result = await query(
        `SELECT 
           pr.market_potential,
           pr.competition_level,
           pr.trend_score,
           pr.sentiment_score,
           p.sales_count
         FROM product_research pr
         JOIN products p ON pr.product_id = p.shopify_id
         WHERE pr.updated_at > NOW() - INTERVAL '30 days'
         LIMIT 100`
      );

      return result.rows.map(row => ({
        input: {
          seasonality: 0.5, // Would need historical data
          trend: row.trend_score,
          competition: 1 - row.competition_level,
          sentiment: row.market_potential,
        },
        output: {
          demand: Math.min(row.sales_count / 100, 1),
        },
      }));
    } catch (error) {
      logger.error('Failed to gather training data', error);
      return [];
    }
  }
}

export const predictiveAnalyticsService = new PredictiveAnalyticsService();