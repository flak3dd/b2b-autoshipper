import { logger } from '../utils/logger';
import { query } from '../db/connection';

interface SupplierScore {
  supplierId: number;
  supplierName: string;
  overallScore: number;
  reliabilityScore: number;
  costScore: number;
  qualityScore: number;
  speedScore: number;
  communicationScore: number;
  riskScore: number;
  trendScore: number;
  factors: {
    onTimeDeliveryRate: number;
    orderAccuracyRate: number;
    priceCompetitiveness: number;
    productQualityRating: number;
    averageShippingTime: number;
    responseTime: number;
    errorRate: number;
    volumeCapacity: number;
    financialHealth: number;
    geographicAdvantage: number;
  };
  confidence: number;
  recommendations: string[];
  riskFactors: string[];
  strengths: string[];
  lastUpdated: Date;
}

interface SupplierPerformance {
  supplierId: number;
  totalOrders: number;
  onTimeDeliveries: number;
  accurateOrders: number;
  averageShippingTime: number;
  averageResponseTime: number;
  errorCount: number;
  totalVolume: number;
  customerSatisfaction: number;
}

class SupplierScoringService {
  private scoringInterval: NodeJS.Timeout | null = null;

  /**
   * Start automated supplier scoring
   */
  startScoring(intervalDays: number = 7): void {
    if (this.scoringInterval) {
      logger.warn('Supplier scoring is already running');
      return;
    }

    logger.info(`Starting automated supplier scoring with ${intervalDays} day intervals`);

    // Initial scoring
    this.runScoringCycle();

    // Schedule regular scoring
    this.scoringInterval = setInterval(() => {
      this.runScoringCycle();
    }, intervalDays * 24 * 60 * 60 * 1000);
  }

  /**
   * Stop supplier scoring
   */
  stopScoring(): void {
    if (this.scoringInterval) {
      clearInterval(this.scoringInterval);
      this.scoringInterval = null;
      logger.info('Supplier scoring stopped');
    }
  }

  /**
   * Run complete supplier scoring cycle
   */
  private async runScoringCycle(): Promise<void> {
    try {
      logger.info('Starting supplier scoring cycle');

      // Get all active suppliers
      const suppliers = await this.getActiveSuppliers();

      for (const supplier of suppliers) {
        try {
          const score = await this.scoreSupplier(supplier.id);
          await this.storeSupplierScore(score);
        } catch (error) {
          logger.error(`Failed to score supplier ${supplier.id}`, error);
        }
      }

      logger.info(`Supplier scoring cycle completed for ${suppliers.length} suppliers`);
    } catch (error) {
      logger.error('Supplier scoring cycle failed', error);
    }
  }

  /**
   * Get active suppliers
   */
  private async getActiveSuppliers(): Promise<any[]> {
    try {
      const result = await query(
        'SELECT id, name FROM suppliers WHERE is_active = true ORDER BY priority'
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to get active suppliers', error);
      return [];
    }
  }

  /**
   * Score a specific supplier using AI
   */
  async scoreSupplier(supplierId: number): Promise<SupplierScore> {
    try {
      logger.info(`Scoring supplier ${supplierId}`);

      // Gather performance data
      const performance = await this.gatherSupplierPerformance(supplierId);

      // Calculate individual scores
      const reliabilityScore = this.calculateReliabilityScore(performance);
      const costScore = await this.calculateCostScore(supplierId, performance);
      const qualityScore = await this.calculateQualityScore(supplierId, performance);
      const speedScore = this.calculateSpeedScore(performance);
      const communicationScore = this.calculateCommunicationScore(performance);
      const riskScore = this.calculateRiskScore(performance);
      const trendScore = await this.calculateTrendScore(supplierId);

      // Calculate overall score using weighted average
      const overallScore = this.calculateOverallScore({
        reliabilityScore,
        costScore,
        qualityScore,
        speedScore,
        communicationScore,
        riskScore: 1 - riskScore, // Invert risk (lower risk = higher score)
        trendScore,
      });

      // Generate detailed factors
      const factors = {
        onTimeDeliveryRate: performance.onTimeDeliveries / performance.totalOrders,
        orderAccuracyRate: performance.accurateOrders / performance.totalOrders,
        priceCompetitiveness: costScore,
        productQualityRating: qualityScore,
        averageShippingTime: performance.averageShippingTime,
        responseTime: performance.averageResponseTime,
        errorRate: performance.errorCount / performance.totalOrders,
        volumeCapacity: Math.min(performance.totalVolume / 10000, 1), // Normalize to 0-1
        financialHealth: await this.assessFinancialHealth(supplierId),
        geographicAdvantage: await this.assessGeographicAdvantage(supplierId),
      };

      // Generate recommendations
      const recommendations = this.generateRecommendations(supplierId, overallScore, factors);

      // Identify risk factors
      const riskFactors = this.identifyRiskFactors(factors);

      // Identify strengths
      const strengths = this.identifyStrengths(factors);

      // Calculate confidence
      const confidence = this.calculateScoringConfidence(performance);

      const supplierName = await this.getSupplierName(supplierId);

      const score: SupplierScore = {
        supplierId,
        supplierName,
        overallScore,
        reliabilityScore,
        costScore,
        qualityScore,
        speedScore,
        communicationScore,
        riskScore,
        trendScore,
        factors,
        confidence,
        recommendations,
        riskFactors,
        strengths,
        lastUpdated: new Date(),
      };

      logger.info(`Supplier scoring completed for ${supplierName}`, {
        overallScore,
        confidence,
      });

      return score;
    } catch (error) {
      logger.error(`Failed to score supplier ${supplierId}`, error);
      throw error;
    }
  }

  /**
   * Gather supplier performance data
   */
  private async gatherSupplierPerformance(supplierId: number): Promise<SupplierPerformance> {
    try {
      const result = await query(
        `SELECT 
           COUNT(*) as total_orders,
           SUM(CASE WHEN fulfillment_status = 'delivered' 
               AND EXTRACT(DAY FROM (updated_at - created_at)) <= 7 THEN 1 ELSE 0 END) as on_time_deliveries,
           SUM(CASE WHEN error_log IS NULL THEN 1 ELSE 0 END) as accurate_orders,
           AVG(EXTRACT(DAY FROM (updated_at - created_at))) as avg_shipping_time,
           COALESCE(AVG(response_time_hours), 24) as avg_response_time,
           SUM(CASE WHEN error_log IS NOT NULL THEN 1 ELSE 0 END) as error_count,
           COALESCE(SUM(line_item_quantity), 0) as total_volume,
           COALESCE(AVG(customer_rating), 3.5) as customer_satisfaction
         FROM order_mappings om
         WHERE supplier_id = $1
         AND created_at > NOW() - INTERVAL '90 days'`,
        [supplierId]
      );

      const data = result.rows[0];

      return {
        supplierId,
        totalOrders: parseInt(data.total_orders) || 0,
        onTimeDeliveries: parseInt(data.on_time_deliveries) || 0,
        accurateOrders: parseInt(data.accurate_orders) || 0,
        averageShippingTime: parseFloat(data.avg_shipping_time) || 7,
        averageResponseTime: parseFloat(data.avg_response_time) || 24,
        errorCount: parseInt(data.error_count) || 0,
        totalVolume: parseInt(data.total_volume) || 0,
        customerSatisfaction: parseFloat(data.customer_satisfaction) || 3.5,
      };
    } catch (error) {
      logger.error(`Failed to gather performance data for supplier ${supplierId}`, error);
      // Return default values
      return {
        supplierId,
        totalOrders: 0,
        onTimeDeliveries: 0,
        accurateOrders: 0,
        averageShippingTime: 7,
        averageResponseTime: 24,
        errorCount: 0,
        totalVolume: 0,
        customerSatisfaction: 3.5,
      };
    }
  }

  /**
   * Calculate reliability score
   */
  private calculateReliabilityScore(performance: SupplierPerformance): number {
    if (performance.totalOrders === 0) return 0.5; // Default for new suppliers

    const onTimeRate = performance.onTimeDeliveries / performance.totalOrders;
    const accuracyRate = performance.accurateOrders / performance.totalOrders;
    
    // Weighted combination
    return (onTimeRate * 0.6) + (accuracyRate * 0.4);
  }

  /**
   * Calculate cost score
   */
  private async calculateCostScore(supplierId: number, performance: SupplierPerformance): Promise<number> {
    try {
      // Get average wholesale prices from this supplier
      const result = await query(
        `SELECT AVG(wholesale_price) as avg_price,
                AVG(retail_price) as avg_retail
         FROM products 
         WHERE supplier_id = $1`,
        [supplierId]
      );

      const data = result.rows[0];
      if (!data.avg_price || !data.avg_retail) return 0.5;

      const margin = (data.avg_retail - data.avg_price) / data.avg_retail;
      
      // Higher margin = better cost score (assuming retail prices are market-based)
      return Math.min(margin / 0.5, 1); // Normalize to 0-1
    } catch (error) {
      return 0.5;
    }
  }

  /**
   * Calculate quality score
   */
  private async calculateQualityScore(supplierId: number, performance: SupplierPerformance): Promise<number> {
    // Base score on customer satisfaction
    let qualityScore = (performance.customerSatisfaction - 1) / 4; // Normalize 1-5 to 0-1

    // Adjust for error rate
    if (performance.totalOrders > 0) {
      const errorRate = performance.errorCount / performance.totalOrders;
      qualityScore *= (1 - errorRate);
    }

    return Math.max(0, Math.min(qualityScore, 1));
  }

  /**
   * Calculate speed score
   */
  private calculateSpeedScore(performance: SupplierPerformance): number {
    // Faster shipping = higher score
    // Assume 3 days is excellent, 14 days is poor
    const maxDays = 14;
    const minDays = 3;
    
    if (performance.averageShippingTime <= minDays) return 1;
    if (performance.averageShippingTime >= maxDays) return 0;

    return 1 - ((performance.averageShippingTime - minDays) / (maxDays - minDays));
  }

  /**
   * Calculate communication score
   */
  private calculateCommunicationScore(performance: SupplierPerformance): number {
    // Faster response = higher score
    // Assume 2 hours is excellent, 48 hours is poor
    const maxHours = 48;
    const minHours = 2;

    if (performance.averageResponseTime <= minHours) return 1;
    if (performance.averageResponseTime >= maxHours) return 0;

    return 1 - ((performance.averageResponseTime - minHours) / (maxHours - minHours));
  }

  /**
   * Calculate risk score
   */
  private calculateRiskScore(performance: SupplierPerformance): number {
    let riskScore = 0;

    // Error rate contributes to risk
    if (performance.totalOrders > 0) {
      riskScore += (performance.errorCount / performance.totalOrders) * 0.4;
    }

    // Low volume increases risk
    if (performance.totalVolume < 1000) {
      riskScore += 0.2;
    }

    // Poor customer satisfaction increases risk
    if (performance.customerSatisfaction < 3) {
      riskScore += 0.3;
    }

    return Math.min(riskScore, 1);
  }

  /**
   * Calculate trend score
   */
  private async calculateTrendScore(supplierId: number): Promise<number> {
    try {
      // Compare recent performance to historical performance
      const recentResult = await query(
        `SELECT 
           COUNT(*) as recent_orders,
           AVG(EXTRACT(DAY FROM (updated_at - created_at))) as recent_shipping_time
         FROM order_mappings 
         WHERE supplier_id = $1
         AND created_at > NOW() - INTERVAL '30 days'`,
        [supplierId]
      );

      const historicalResult = await query(
        `SELECT 
           COUNT(*) as historical_orders,
           AVG(EXTRACT(DAY FROM (updated_at - created_at))) as historical_shipping_time
         FROM order_mappings 
         WHERE supplier_id = $1
         AND created_at BETWEEN NOW() - INTERVAL '90 days' AND NOW() - INTERVAL '30 days'`,
        [supplierId]
      );

      const recent = recentResult.rows[0];
      const historical = historicalResult.rows[0];

      if (!recent.recent_orders || !historical.historical_orders) return 0.5;

      // Volume trend
      const volumeTrend = recent.recent_orders / historical.historical_orders;
      
      // Speed trend
      const speedTrend = historical.historical_shipping_time / recent.recent_shipping_time;

      // Combine trends
      return Math.min(((volumeTrend + speedTrend) / 2), 1);
    } catch (error) {
      return 0.5;
    }
  }

  /**
   * Calculate overall score
   */
  private calculateOverallScore(scores: {
    reliabilityScore: number;
    costScore: number;
    qualityScore: number;
    speedScore: number;
    communicationScore: number;
    riskScore: number;
    trendScore: number;
  }): number {
    const weights = {
      reliability: 0.25,
      cost: 0.20,
      quality: 0.20,
      speed: 0.15,
      communication: 0.10,
      risk: 0.05,
      trend: 0.05,
    };

    return (
      (scores.reliabilityScore * weights.reliability) +
      (scores.costScore * weights.cost) +
      (scores.qualityScore * weights.quality) +
      (scores.speedScore * weights.speed) +
      (scores.communicationScore * weights.communication) +
      (scores.riskScore * weights.risk) +
      (scores.trendScore * weights.trend)
    );
  }

  /**
   * Assess financial health
   */
  private async assessFinancialHealth(supplierId: number): Promise<number> {
    // Simplified assessment - in production would use external data
    try {
      const result = await query(
        `SELECT 
           COUNT(*) as total_orders,
           SUM(CASE WHEN fulfillment_status = 'paid' THEN 1 ELSE 0 END) as paid_orders
         FROM order_mappings 
         WHERE supplier_id = $1
         AND created_at > NOW() - INTERVAL '90 days'`,
        [supplierId]
      );

      const data = result.rows[0];
      if (!data.total_orders || data.total_orders === 0) return 0.5;

      const paymentRate = data.paid_orders / data.total_orders;
      return paymentRate;
    } catch (error) {
      return 0.5;
    }
  }

  /**
   * Assess geographic advantage
   */
  private async assessGeographicAdvantage(supplierId: number): Promise<number> {
    // Simplified assessment - in production would use actual locations
    try {
      const supplierInfo = await query(
        'SELECT name FROM suppliers WHERE id = $1',
        [supplierId]
      );

      const name = supplierInfo.rows[0]?.name || '';
      
      // Assume certain suppliers have geographic advantages
      if (name.toLowerCase().includes('us') || name.toLowerCase().includes('domestic')) {
        return 0.9;
      } else if (name.toLowerCase().includes('china') || name.toLowerCase().includes('asia')) {
        return 0.6; // Longer shipping times but potentially lower costs
      }

      return 0.7;
    } catch (error) {
      return 0.7;
    }
  }

  /**
   * Get supplier name
   */
  private async getSupplierName(supplierId: number): Promise<string> {
    try {
      const result = await query(
        'SELECT name FROM suppliers WHERE id = $1',
        [supplierId]
      );

      return result.rows[0]?.name || 'Unknown';
    } catch (error) {
      return 'Unknown';
    }
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(supplierId: number, overallScore: number, factors: SupplierScore['factors']): string[] {
    const recommendations: string[] = [];

    if (overallScore > 0.8) {
      recommendations.push('Consider increasing order volume with this supplier');
      recommendations.push('Use as primary supplier for key product categories');
    } else if (overallScore > 0.6) {
      recommendations.push('Maintain current relationship while monitoring performance');
      recommendations.push('Consider for backup supplier role');
    } else if (overallScore > 0.4) {
      recommendations.push('Reduce dependency on this supplier');
      recommendations.push('Implement quality control measures');
      recommendations.push('Seek alternative suppliers');
    } else {
      recommendations.push('Phase out this supplier where possible');
      recommendations.push('Immediately find replacement suppliers');
    }

    if (factors.onTimeDeliveryRate < 0.8) {
      recommendations.push('Address on-time delivery issues with supplier');
    }

    if (factors.orderAccuracyRate < 0.9) {
      recommendations.push('Implement stricter quality control for this supplier');
    }

    if (factors.averageShippingTime > 10) {
      recommendations.push('Consider closer suppliers for time-sensitive products');
    }

    if (factors.responseTime > 24) {
      recommendations.push('Establish communication SLAs with supplier');
    }

    return recommendations.slice(0, 5);
  }

  /**
   * Identify risk factors
   */
  private identifyRiskFactors(factors: SupplierScore['factors']): string[] {
    const riskFactors: string[] = [];

    if (factors.onTimeDeliveryRate < 0.8) riskFactors.push('Low on-time delivery rate');
    if (factors.orderAccuracyRate < 0.9) riskFactors.push('High order inaccuracy rate');
    if (factors.averageShippingTime > 10) riskFactors.push('Long shipping times');
    if (factors.responseTime > 24) riskFactors.push('Slow response times');
    if (factors.errorRate > 0.1) riskFactors.push('High error rate');
    if (factors.volumeCapacity < 0.3) riskFactors.push('Limited volume capacity');
    if (factors.financialHealth < 0.7) riskFactors.push('Potential financial concerns');
    if (factors.geographicAdvantage < 0.5) riskFactors.push('Geographic disadvantages');

    return riskFactors;
  }

  /**
   * Identify strengths
   */
  private identifyStrengths(factors: SupplierScore['factors']): string[] {
    const strengths: string[] = [];

    if (factors.onTimeDeliveryRate > 0.9) strengths.push('Excellent on-time delivery');
    if (factors.orderAccuracyRate > 0.95) strengths.push('High order accuracy');
    if (factors.averageShippingTime < 5) strengths.push('Fast shipping');
    if (factors.responseTime < 12) strengths.push('Quick response times');
    if (factors.errorRate < 0.05) strengths.push('Low error rate');
    if (factors.volumeCapacity > 0.7) strengths.push('High volume capacity');
    if (factors.priceCompetitiveness > 0.7) strengths.push('Competitive pricing');
    if (factors.geographicAdvantage > 0.8) strengths.push('Geographic advantages');

    return strengths;
  }

  /**
   * Calculate scoring confidence
   */
  private calculateScoringConfidence(performance: SupplierPerformance): number {
    // More data = higher confidence
    const dataVolume = Math.min(performance.totalOrders / 50, 1); // 50+ orders = full confidence
    
    return 0.5 + (dataVolume * 0.5); // Range 0.5-1.0
  }

  /**
   * Store supplier score in database
   */
  private async storeSupplierScore(score: SupplierScore): Promise<void> {
    try {
      await query(
        `INSERT INTO supplier_ai_scores 
         (supplier_id, overall_score, reliability_score, cost_score, quality_score, 
          speed_score, communication_score, risk_score, trend_score, factors, last_scored)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
         ON CONFLICT (supplier_id) 
         DO UPDATE SET
           overall_score = EXCLUDED.overall_score,
           reliability_score = EXCLUDED.reliability_score,
           cost_score = EXCLUDED.cost_score,
           quality_score = EXCLUDED.quality_score,
           speed_score = EXCLUDED.speed_score,
           communication_score = EXCLUDED.communication_score,
           risk_score = EXCLUDED.risk_score,
           trend_score = EXCLUDED.trend_score,
           factors = EXCLUDED.factors,
           last_scored = NOW()`,
        [
          score.supplierId,
          score.overallScore,
          score.reliabilityScore,
          score.costScore,
          score.qualityScore,
          score.speedScore,
          score.communicationScore,
          score.riskScore,
          score.trendScore,
          JSON.stringify(score.factors),
        ]
      );
    } catch (error) {
      logger.error('Failed to store supplier score', error);
    }
  }

  /**
   * Get supplier rankings
   */
  async getSupplierRankings(limit: number = 10): Promise<SupplierScore[]> {
    try {
      const result = await query(
        `SELECT sas.*, s.name as supplier_name
         FROM supplier_ai_scores sas
         JOIN suppliers s ON sas.supplier_id = s.id
         WHERE s.is_active = true
         ORDER BY sas.overall_score DESC
         LIMIT $1`,
        [limit]
      );

      return result.rows.map(row => ({
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        overallScore: parseFloat(row.overall_score),
        reliabilityScore: parseFloat(row.reliability_score),
        costScore: parseFloat(row.cost_score),
        qualityScore: parseFloat(row.quality_score),
        speedScore: parseFloat(row.speed_score),
        communicationScore: parseFloat(row.communication_score),
        riskScore: parseFloat(row.risk_score),
        trendScore: parseFloat(row.trend_score),
        factors: row.factors,
        confidence: 0.8, // Would be calculated properly
        recommendations: [], // Would be generated
        riskFactors: [], // Would be generated
        strengths: [], // Would be generated
        lastUpdated: row.last_scored,
      }));
    } catch (error) {
      logger.error('Failed to get supplier rankings', error);
      return [];
    }
  }

  /**
   * Get supplier performance trends
   */
  async getSupplierPerformanceTrends(supplierId: number, days: number = 90): Promise<any> {
    try {
      const result = await query(
        `SELECT 
           DATE(created_at) as date,
           COUNT(*) as orders,
           SUM(CASE WHEN fulfillment_status = 'delivered' THEN 1 ELSE 0 END) as delivered,
           AVG(EXTRACT(DAY FROM (updated_at - created_at))) as avg_shipping_time
         FROM order_mappings 
         WHERE supplier_id = $1
         AND created_at > NOW() - INTERVAL '${days} days'
         GROUP BY DATE(created_at)
         ORDER BY date ASC`,
        [supplierId]
      );

      return {
        supplierId,
        trends: result.rows,
        summary: {
          totalOrders: result.rows.reduce((sum, row) => sum + parseInt(row.orders), 0),
          deliveryRate: result.rows.reduce((sum, row) => sum + parseInt(row.delivered), 0) / result.rows.reduce((sum, row) => sum + parseInt(row.orders), 0),
          avgShippingTime: result.rows.reduce((sum, row) => sum + parseFloat(row.avg_shipping_time || 0), 0) / result.rows.length,
        },
      };
    } catch (error) {
      logger.error('Failed to get supplier performance trends', error);
      return null;
    }
  }
}

export const supplierScoringService = new SupplierScoringService();