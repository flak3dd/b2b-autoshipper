import { Job } from 'bullmq';
import { logger } from '../utils/logger';
import { aiIntegrationService } from '../services/aiIntegrationService';
import { aiProductResearchService } from '../services/aiProductResearchService';
import { competitorMonitoringService } from '../services/competitorMonitoringService';
import { predictiveAnalyticsService } from '../services/predictiveAnalyticsService';
import { opportunityDetectionService } from '../services/opportunityDetectionService';
import { pricingOptimizationService } from '../services/pricingOptimizationService';
import { supplierScoringService } from '../services/supplierScoringService';

/**
 * AI Product Analysis Job
 */
export async function aiProductAnalysisJob(job: Job<{ productId: string }>): Promise<any> {
  logger.info(`Processing AI product analysis job for ${job.data.productId}`);

  try {
    const result = await aiIntegrationService.runComprehensiveProductAnalysis(job.data.productId);
    
    logger.info(`AI product analysis completed for ${job.data.productId}`, {
      processingTime: result.processingTime,
      confidence: result.productResearch.confidence,
    });

    return result;
  } catch (error) {
    logger.error(`AI product analysis job failed for ${job.data.productId}`, error);
    throw error;
  }
}

/**
 * Batch Product Analysis Job
 */
export async function batchProductAnalysisJob(job: Job<{ productIds: string[] }>): Promise<any> {
  logger.info(`Processing batch product analysis for ${job.data.productIds.length} products`);

  try {
    const results = await Promise.all(
      job.data.productIds.map(productId => 
        aiIntegrationService.runComprehensiveProductAnalysis(productId)
      )
    );

    logger.info(`Batch product analysis completed for ${job.data.productIds.length} products`);

    return {
      totalProducts: job.data.productIds.length,
      successfulAnalyses: results.length,
      averageProcessingTime: results.reduce((sum, r) => sum + r.processingTime, 0) / results.length,
      results,
    };
  } catch (error) {
    logger.error('Batch product analysis job failed', error);
    throw error;
  }
}

/**
 * Competitor Monitoring Job
 */
export async function competitorMonitoringJob(job: Job): Promise<any> {
  logger.info('Processing competitor monitoring job');

  try {
    // Trigger manual monitoring cycle
    const pricingPatterns = await competitorMonitoringService.analyzePricingPatterns('Amazon');
    const alerts = await competitorMonitoringService.getCompetitorAlerts(24);

    logger.info('Competitor monitoring job completed', {
      pricingPatterns: pricingPatterns?.competitorName,
      alertsCount: alerts.length,
    });

    return {
      pricingPatterns,
      alerts,
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error('Competitor monitoring job failed', error);
    throw error;
  }
}

/**
 * Market Opportunity Scan Job
 */
export async function marketOpportunityScanJob(job: Job): Promise<any> {
  logger.info('Processing market opportunity scan job');

  try {
    const opportunities = await opportunityDetectionService.getPendingOpportunities(20);
    const trends = await predictiveAnalyticsService.predictMarketTrends();

    logger.info('Market opportunity scan completed', {
      opportunitiesCount: opportunities.length,
      trendsCount: trends.length,
    });

    return {
      opportunities,
      trends,
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error('Market opportunity scan job failed', error);
    throw error;
  }
}

/**
 * Pricing Optimization Job
 */
export async function pricingOptimizationJob(job: Job<{ productId?: string }>): Promise<any> {
  logger.info('Processing pricing optimization job');

  try {
    let optimizations;

    if (job.data.productId) {
      // Optimize specific product
      const optimization = await pricingOptimizationService.optimizeProductPricing(job.data.productId);
      optimizations = optimization ? [optimization] : [];
    } else {
      // Run optimization cycle (batch)
      optimizations = []; // Would be populated by the internal cycle
    }

    logger.info('Pricing optimization job completed', {
      optimizationsCount: optimizations.length,
    });

    return {
      optimizations,
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error('Pricing optimization job failed', error);
    throw error;
  }
}

/**
 * Supplier Scoring Job
 */
export async function supplierScoringJob(job: Job<{ supplierId?: number }>): Promise<any> {
  logger.info('Processing supplier scoring job');

  try {
    let scores;

    if (job.data.supplierId) {
      // Score specific supplier
      const score = await supplierScoringService.scoreSupplier(job.data.supplierId);
      scores = [score];
    } else {
      // Get all supplier rankings
      scores = await supplierScoringService.getSupplierRankings(10);
    }

    logger.info('Supplier scoring job completed', {
      scoresCount: scores.length,
    });

    return {
      scores,
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error('Supplier scoring job failed', error);
    throw error;
  }
}

/**
 * Demand Forecast Job
 */
export async function demandForecastJob(job: Job<{ productId: string; period?: string }>): Promise<any> {
  logger.info(`Processing demand forecast job for ${job.data.productId}`);

  try {
    const forecast = await predictiveAnalyticsService.generateDemandForecast(
      job.data.productId,
      job.data.period || '30d'
    );

    logger.info(`Demand forecast completed for ${job.data.productId}`, {
      predictedDemand: forecast.predictedDemand,
      confidence: forecast.confidence,
    });

    return forecast;
  } catch (error) {
    logger.error(`Demand forecast job failed for ${job.data.productId}`, error);
    throw error;
  }
}

/**
 * AI System Calibration Job
 */
export async function aiCalibrationJob(job: Job): Promise<any> {
  logger.info('Processing AI system calibration job');

  try {
    await aiIntegrationService.calibrateModels();

    const validationResults = await aiIntegrationService.runValidationTests();

    logger.info('AI system calibration completed', {
      overallHealth: validationResults.overallHealth,
    });

    return {
      calibrationCompleted: true,
      validationResults,
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error('AI system calibration job failed', error);
    throw error;
  }
}

/**
 * Market Intelligence Update Job
 */
export async function marketIntelligenceUpdateJob(job: Job): Promise<any> {
  logger.info('Processing market intelligence update job');

  try {
    const dashboard = await aiIntegrationService.getMarketIntelligenceDashboard();

    logger.info('Market intelligence update completed', {
      trendsCount: dashboard.marketTrends.length,
      opportunitiesCount: dashboard.opportunities.length,
    });

    return dashboard;
  } catch (error) {
    logger.error('Market intelligence update job failed', error);
    throw error;
  }
}