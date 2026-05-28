import { logger } from '../utils/logger';
import { aiProductResearchService } from './aiProductResearchService';
import { competitorMonitoringService } from './competitorMonitoringService';
import { predictiveAnalyticsService } from './predictiveAnalyticsService';
import { opportunityDetectionService } from './opportunityDetectionService';
import { pricingOptimizationService } from './pricingOptimizationService';
import { supplierScoringService } from './supplierScoringService';

interface AISystemStatus {
  productResearch: boolean;
  competitorMonitoring: boolean;
  predictiveAnalytics: boolean;
  opportunityDetection: boolean;
  pricingOptimization: boolean;
  supplierScoring: boolean;
  overallStatus: 'operational' | 'degraded' | 'offline';
}

interface AIPerformanceMetrics {
  totalAnalyses: number;
  accuracyRate: number;
  averageProcessingTime: number;
  errorRate: number;
  uptime: number;
  lastUpdate: Date;
}

class AIIntegrationService {
  private systemStatus: AISystemStatus = {
    productResearch: false,
    competitorMonitoring: false,
    predictiveAnalytics: false,
    opportunityDetection: false,
    pricingOptimization: false,
    supplierScoring: false,
    overallStatus: 'offline',
  };

  private performanceMetrics: AIPerformanceMetrics = {
    totalAnalyses: 0,
    accuracyRate: 0,
    averageProcessingTime: 0,
    errorRate: 0,
    uptime: 0,
    lastUpdate: new Date(),
  };

  private startTime: Date = new Date();

  /**
   * Initialize all AI systems
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing AI integration service');

      // Initialize database schema for AI features
      await this.initializeAISchema();

      // Start all AI services
      this.startAllServices();

      // Update system status
      this.updateSystemStatus();

      logger.info('AI integration service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize AI integration service', error);
      throw error;
    }
  }

  /**
   * Initialize AI database schema
   */
  private async initializeAISchema(): Promise<void> {
    try {
      const { query } = require('./db/connection');
      const schema = require('fs').readFileSync('./src/db/ai_schema.sql', 'utf8');
      await query(schema);
      logger.info('AI database schema initialized');
    } catch (error) {
      logger.error('Failed to initialize AI schema', error);
      // Don't throw - schema might already exist
    }
  }

  /**
   * Start all AI services
   */
  private startAllServices(): void {
    try {
      // Start competitor monitoring (every 15 minutes)
      competitorMonitoringService.startMonitoring(15);

      // Start opportunity detection (every 6 hours)
      opportunityDetectionService.startDetection(6);

      // Start pricing optimization (every 4 hours)
      pricingOptimizationService.startOptimization(4);

      // Start supplier scoring (every 7 days)
      supplierScoringService.startScoring(7);

      logger.info('All AI services started');
    } catch (error) {
      logger.error('Failed to start AI services', error);
    }
  }

  /**
   * Stop all AI services
   */
  stopAllServices(): void {
    try {
      competitorMonitoringService.stopMonitoring();
      opportunityDetectionService.stopDetection();
      pricingOptimizationService.stopOptimization();
      supplierScoringService.stopScoring();

      logger.info('All AI services stopped');
    } catch (error) {
      logger.error('Failed to stop AI services', error);
    }
  }

  /**
   * Update system status
   */
  private updateSystemStatus(): void {
    this.systemStatus = {
      productResearch: true, // Always available
      competitorMonitoring: true, // Started
      predictiveAnalytics: true, // Always available
      opportunityDetection: true, // Started
      pricingOptimization: true, // Started
      supplierScoring: true, // Started
      overallStatus: 'operational',
    };
  }

  /**
   * Get system status
   */
  getSystemStatus(): AISystemStatus {
    return this.systemStatus;
  }

  /**
   * Run comprehensive product analysis
   */
  async runComprehensiveProductAnalysis(productId: string): Promise<any> {
    const startTime = Date.now();

    try {
      logger.info(`Running comprehensive AI analysis for product ${productId}`);

      // Run all AI analyses in parallel
      const [
        productResearch,
        demandForecast,
        opportunities,
        pricingOptimization,
      ] = await Promise.all([
        aiProductResearchService.analyzeProduct({ id: productId }),
        predictiveAnalyticsService.generateDemandForecast(productId),
        opportunityDetectionService.analyzeProductOpportunities(productId),
        pricingOptimizationService.optimizeProductPricing(productId),
      ]);

      const processingTime = Date.now() - startTime;

      // Update performance metrics
      this.performanceMetrics.totalAnalyses++;
      this.performanceMetrics.averageProcessingTime = 
        (this.performanceMetrics.averageProcessingTime * (this.performanceMetrics.totalAnalyses - 1) + processingTime) / 
        this.performanceMetrics.totalAnalyses;
      this.performanceMetrics.lastUpdate = new Date();

      logger.info(`Comprehensive analysis completed for ${productId}`, {
        processingTime,
        marketPotential: productResearch.marketPotential,
        confidence: productResearch.confidence,
      });

      return {
        productId,
        productResearch,
        demandForecast,
        opportunities,
        pricingOptimization,
        processingTime,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error(`Comprehensive analysis failed for ${productId}`, error);
      
      // Update error rate
      this.performanceMetrics.errorRate = 
        (this.performanceMetrics.errorRate * (this.performanceMetrics.totalAnalyses) + 1) / 
        (this.performanceMetrics.totalAnalyses + 1);

      throw error;
    }
  }

  /**
   * Get market intelligence dashboard
   */
  async getMarketIntelligenceDashboard(): Promise<any> {
    try {
      logger.info('Generating market intelligence dashboard');

      const [
        marketTrends,
        pendingOpportunities,
        competitorAlerts,
        supplierRankings,
        pricingAnalytics,
        marketSignals,
      ] = await Promise.all([
        predictiveAnalyticsService.predictMarketTrends(),
        opportunityDetectionService.getPendingOpportunities(10),
        competitorMonitoringService.getCompetitorAlerts(24),
        supplierScoringService.getSupplierRankings(5),
        pricingOptimizationService.getPricingAnalytics(30),
        predictiveAnalyticsService.generateMarketSignals(),
      ]);

      return {
        summary: {
          totalTrends: marketTrends.length,
          pendingOpportunities: pendingOpportunities.length,
          competitorAlerts: competitorAlerts.length,
          activeSuppliers: supplierRankings.length,
          marketSignals: marketSignals.length,
        },
        marketTrends,
        opportunities: pendingOpportunities,
        competitorAlerts,
        supplierRankings,
        pricingAnalytics,
        marketSignals,
        systemStatus: this.getSystemStatus(),
        performanceMetrics: this.getPerformanceMetrics(),
        generatedAt: new Date(),
      };
    } catch (error) {
      logger.error('Failed to generate market intelligence dashboard', error);
      throw error;
    }
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): AIPerformanceMetrics {
    this.performanceMetrics.uptime = (Date.now() - this.startTime.getTime()) / 1000; // seconds
    return this.performanceMetrics;
  }

  /**
   * Run automated validation tests
   */
  async runValidationTests(): Promise<any> {
    logger.info('Running AI system validation tests');

    const testResults = {
      productResearch: await this.testProductResearch(),
      competitorMonitoring: await this.testCompetitorMonitoring(),
      predictiveAnalytics: await this.testPredictiveAnalytics(),
      opportunityDetection: await this.testOpportunityDetection(),
      pricingOptimization: await this.testPricingOptimization(),
      supplierScoring: await this.testSupplierScoring(),
    };

    const overallHealth = Object.values(testResults).every(result => result.status === 'pass');

    return {
      overallHealth,
      testResults,
      timestamp: new Date(),
    };
  }

  /**
   * Test product research service
   */
  private async testProductResearch(): Promise<any> {
    try {
      const testProduct = {
        id: 'test-123',
        title: 'Test Product for AI Analysis',
        description: 'This is a test product description for AI analysis',
        price: '99.99',
      };

      const result = await aiProductResearchService.analyzeProduct(testProduct);

      return {
        status: 'pass',
        message: 'Product research service operational',
        result: {
          category: result.category,
          confidence: result.confidence,
          marketPotential: result.marketPotential,
        },
      };
    } catch (error) {
      return {
        status: 'fail',
        message: 'Product research service failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Test competitor monitoring service
   */
  private async testCompetitorMonitoring(): Promise<any> {
    try {
      const pricingPatterns = await competitorMonitoringService.analyzePricingPatterns('Amazon');

      return {
        status: 'pass',
        message: 'Competitor monitoring service operational',
        result: {
          competitorName: pricingPatterns?.competitorName,
          averagePrice: pricingPatterns?.averagePrice,
        },
      };
    } catch (error) {
      return {
        status: 'fail',
        message: 'Competitor monitoring service failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Test predictive analytics service
   */
  private async testPredictiveAnalytics(): Promise<any> {
    try {
      const trends = await predictiveAnalyticsService.predictMarketTrends();

      return {
        status: 'pass',
        message: 'Predictive analytics service operational',
        result: {
          trendsCount: trends.length,
        },
      };
    } catch (error) {
      return {
        status: 'fail',
        message: 'Predictive analytics service failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Test opportunity detection service
   */
  private async testOpportunityDetection(): Promise<any> {
    try {
      const opportunities = await opportunityDetectionService.getPendingOpportunities(5);

      return {
        status: 'pass',
        message: 'Opportunity detection service operational',
        result: {
          opportunitiesCount: opportunities.length,
        },
      };
    } catch (error) {
      return {
        status: 'fail',
        message: 'Opportunity detection service failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Test pricing optimization service
   */
  private async testPricingOptimization(): Promise<any> {
    try {
      const analytics = await pricingOptimizationService.getPricingAnalytics(30);

      return {
        status: 'pass',
        message: 'Pricing optimization service operational',
        result: {
          hasAnalytics: analytics !== null,
        },
      };
    } catch (error) {
      return {
        status: 'fail',
        message: 'Pricing optimization service failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Test supplier scoring service
   */
  private async testSupplierScoring(): Promise<any> {
    try {
      const rankings = await supplierScoringService.getSupplierRankings(5);

      return {
        status: 'pass',
        message: 'Supplier scoring service operational',
        result: {
          suppliersCount: rankings.length,
        },
      };
    } catch (error) {
      return {
        status: 'fail',
        message: 'Supplier scoring service failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Calibrate AI models
   */
  async calibrateModels(): Promise<void> {
    try {
      logger.info('Calibrating AI models');

      // Retrain predictive models
      await predictiveAnalyticsService.retrainModel();

      // Clear caches to force fresh analysis
      aiProductResearchService.clearCache();

      logger.info('AI model calibration completed');
    } catch (error) {
      logger.error('AI model calibration failed', error);
      throw error;
    }
  }

  /**
   * Get AI system health report
   */
  async getHealthReport(): Promise<any> {
    const validationResults = await this.runValidationTests();
    const dashboard = await this.getMarketIntelligenceDashboard();

    return {
      systemHealth: validationResults.overallHealth ? 'healthy' : 'degraded',
      uptime: this.getPerformanceMetrics().uptime,
      totalAnalyses: this.getPerformanceMetrics().totalAnalyses,
      averageProcessingTime: this.getPerformanceMetrics().averageProcessingTime,
      errorRate: this.getPerformanceMetrics().errorRate,
      services: validationResults.testResults,
      marketOverview: dashboard.summary,
      recommendations: this.generateHealthRecommendations(validationResults),
      generatedAt: new Date(),
    };
  }

  /**
   * Generate health recommendations
   */
  private generateHealthRecommendations(validationResults: any): string[] {
    const recommendations: string[] = [];

    for (const [service, result] of Object.entries(validationResults.testResults)) {
      if (result.status === 'fail') {
        recommendations.push(`Investigate ${service} service: ${result.message}`);
      }
    }

    if (this.performanceMetrics.errorRate > 0.1) {
      recommendations.push('High error rate detected - review system logs');
    }

    if (this.performanceMetrics.averageProcessingTime > 5000) {
      recommendations.push('Processing time above threshold - consider optimization');
    }

    if (recommendations.length === 0) {
      recommendations.push('All systems operating normally');
    }

    return recommendations;
  }
}

export const aiIntegrationService = new AIIntegrationService();