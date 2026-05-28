import axios from 'axios';
import * as natural from 'natural';
import OpenAI from 'openai';
import { logger } from '../utils/logger';
import { query } from '../db/connection';
import { config } from '../config';

// Initialize NLP tools
const tokenizer = new natural.WordTokenizer();
const stemmer = natural.PorterStemmer;
const analyzer = new natural.SentimentAnalyzer('English', natural.PorterStemmer, 'afinn');

// Initialize OpenAI (optional - if API key is provided)
let openaiClient: OpenAI | null = null;
if (process.env.OPENAI_API_KEY) {
  openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

interface ProductResearch {
  productId: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  sentimentScore: number;
  marketPotential: number;
  competitionLevel: number;
  trendScore: number;
  recommendedPrice: number;
  confidence: number;
  insights: string[];
}

interface MarketTrend {
  trend: string;
  category: string;
  growthRate: number;
  timeframe: string;
  confidence: number;
  keywords: string[];
  relatedProducts: string[];
}

interface CompetitorAnalysis {
  competitorName: string;
  marketShare: number;
  pricingStrategy: string;
  productCount: number;
  averagePrice: number;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
}

class AIProductResearchService {
  private researchCache: Map<string, ProductResearch> = new Map();
  private trendCache: Map<string, MarketTrend[]> = new Map();
  private competitorCache: Map<string, CompetitorAnalysis> = new Map();

  /**
   * Advanced product analysis using NLP and AI
   */
  async analyzeProduct(productData: any): Promise<ProductResearch> {
    try {
      const cacheKey = `${productData.id}_${productData.title}`;
      
      // Check cache
      if (this.researchCache.has(cacheKey)) {
        logger.debug(`Returning cached analysis for product ${productData.id}`);
        return this.researchCache.get(cacheKey)!;
      }

      logger.info(`Analyzing product ${productData.id}: ${productData.title}`);

      // Extract features using NLP
      const tokens = tokenizer.tokenize(productData.title + ' ' + productData.description);
      const keywords = this.extractKeywords(tokens);
      const sentiment = this.analyzeSentiment(productData.description);
      
      // Categorize product
      const category = await this.categorizeProduct(productData);
      
      // Analyze market potential
      const marketPotential = await this.calculateMarketPotential(productData, keywords);
      
      // Assess competition
      const competitionLevel = await this.assessCompetition(productData, category);
      
      // Calculate trend score
      const trendScore = await this.calculateTrendScore(keywords, category);
      
      // Generate pricing recommendation
      const recommendedPrice = await this.generatePricingRecommendation(productData, marketPotential, competitionLevel);
      
      // Generate AI insights
      const insights = await this.generateInsights(productData, {
        keywords,
        sentiment,
        category,
        marketPotential,
        competitionLevel,
        trendScore,
      });

      const research: ProductResearch = {
        productId: productData.id,
        title: productData.title,
        description: productData.description,
        category,
        tags: keywords,
        sentimentScore: sentiment,
        marketPotential,
        competitionLevel,
        trendScore,
        recommendedPrice,
        confidence: this.calculateConfidence(marketPotential, competitionLevel, trendScore),
        insights,
      };

      // Cache results
      this.researchCache.set(cacheKey, research);
      
      // Store in database
      await this.storeResearch(research);

      logger.info(`Product analysis completed for ${productData.id}`, {
        marketPotential,
        competitionLevel,
        trendScore,
        recommendedPrice,
      });

      return research;
    } catch (error) {
      logger.error(`Product analysis failed for ${productData.id}`, error);
      throw error;
    }
  }

  /**
   * Extract relevant keywords using NLP
   */
  private extractKeywords(tokens: string[]): string[] {
    // Remove stop words and stem
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    
    const filteredTokens = tokens
      .map(token => token.toLowerCase())
      .filter(token => !stopWords.has(token) && token.length > 2)
      .map(token => stemmer.stem(token));

    // Calculate term frequency
    const termFrequency = new Map<string, number>();
    filteredTokens.forEach(token => {
      termFrequency.set(token, (termFrequency.get(token) || 0) + 1);
    });

    // Return top keywords by frequency
    return Array.from(termFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([token]) => token);
  }

  /**
   * Analyze sentiment of product description
   */
  private analyzeSentiment(text: string): number {
    try {
      const tokens = tokenizer.tokenize(text);
      const score = analyzer.getSentiment(tokens);
      return score;
    } catch (error) {
      logger.error('Sentiment analysis failed', error);
      return 0;
    }
  }

  /**
   * Categorize product using ML-like classification
   */
  private async categorizeProduct(productData: any): Promise<string> {
    const keywords = tokenizer.tokenize(productData.title + ' ' + productData.description);
    
    // Simple keyword-based categorization (can be enhanced with ML)
    const categoryRules: { [key: string]: string[] } = {
      'Electronics': ['phone', 'laptop', 'tablet', 'computer', 'electronic', 'digital', 'wireless', 'bluetooth'],
      'Clothing': ['shirt', 'pants', 'dress', 'shoes', 'clothing', 'fashion', 'apparel', 'wear'],
      'Home & Garden': ['home', 'garden', 'furniture', 'decor', 'kitchen', 'bathroom', 'bedroom'],
      'Sports': ['sport', 'fitness', 'exercise', 'gym', 'outdoor', 'hiking', 'camping'],
      'Beauty': ['beauty', 'cosmetic', 'skin', 'hair', 'makeup', 'fragrance', 'skincare'],
      'Toys': ['toy', 'game', 'kid', 'children', 'play', 'baby', 'infant'],
      'Automotive': ['car', 'auto', 'vehicle', 'truck', 'motorcycle', 'parts', 'accessories'],
    };

    const lowerKeywords = keywords.map(k => k.toLowerCase());
    
    for (const [category, categoryKeywords] of Object.entries(categoryRules)) {
      const matchCount = categoryKeywords.filter(kw => 
        lowerKeywords.some(keyword => keyword.includes(kw))
      ).length;
      
      if (matchCount >= 2) {
        return category;
      }
    }

    return 'General';
  }

  /**
   * Calculate market potential using multiple factors
   */
  private async calculateMarketPotential(productData: any, keywords: string[]): Promise<number> {
    let potentialScore = 0.5; // Base score

    // Factor 1: Keyword popularity (simulated)
    const popularKeywords = ['wireless', 'smart', 'digital', 'premium', 'eco', 'sustainable'];
    const keywordPopularity = keywords.filter(kw => popularKeywords.includes(kw)).length;
    potentialScore += (keywordPopularity * 0.1);

    // Factor 2: Price point analysis
    const price = parseFloat(productData.price) || 0;
    if (price > 50 && price < 200) {
      potentialScore += 0.15; // Sweet spot for B2B
    } else if (price > 200 && price < 500) {
      potentialScore += 0.1; // Premium segment
    }

    // Factor 3: Description quality
    const descriptionLength = productData.description?.length || 0;
    if (descriptionLength > 200) {
      potentialScore += 0.1; // Detailed descriptions indicate quality
    }

    // Factor 4: Historical data (if available)
    const historicalPerformance = await this.getHistoricalPerformance(productData.id);
    if (historicalPerformance) {
      potentialScore += historicalPerformance * 0.15;
    }

    return Math.min(Math.max(potentialScore, 0), 1); // Normalize to 0-1
  }

  /**
   * Assess competition level for product category
   */
  private async assessCompetition(productData: any, category: string): Promise<number> {
    // Simulated competition assessment (in real implementation, would scrape competitor data)
    const competitionLevels: { [key: string]: number } = {
      'Electronics': 0.8,
      'Clothing': 0.9,
      'Home & Garden': 0.6,
      'Sports': 0.7,
      'Beauty': 0.85,
      'Toys': 0.75,
      'Automotive': 0.65,
      'General': 0.5,
    };

    const baseCompetition = competitionLevels[category] || 0.5;
    
    // Adjust based on product uniqueness
    const keywords = tokenizer.tokenize(productData.title);
    const uniqueKeywords = keywords.filter(kw => kw.length > 8).length;
    const uniquenessBonus = Math.min(uniqueKeywords * 0.05, 0.2);

    return Math.min(Math.max(baseCompetition - uniquenessBonus, 0), 1);
  }

  /**
   * Calculate trend score based on keyword analysis
   */
  private async calculateTrendScore(keywords: string[], category: string): Promise<number> {
    // Simulated trend analysis (in real implementation, would use Google Trends, social media, etc.)
    const trendingKeywords = ['sustainable', 'eco-friendly', 'smart', 'wireless', 'premium', 'minimalist'];
    const trendMatches = keywords.filter(kw => trendingKeywords.includes(kw)).length;
    
    let trendScore = 0.3; // Base score
    trendScore += (trendMatches * 0.15);
    
    // Category-specific trends
    const categoryTrends: { [key: string]: number } = {
      'Electronics': 0.7,
      'Home & Garden': 0.6,
      'Sports': 0.65,
      'Beauty': 0.75,
    };
    
    if (categoryTrends[category]) {
      trendScore += categoryTrends[category] * 0.2;
    }

    return Math.min(Math.max(trendScore, 0), 1);
  }

  /**
   * Generate pricing recommendation using AI
   */
  private async generatePricingRecommendation(
    productData: any, 
    marketPotential: number, 
    competitionLevel: number
  ): Promise<number> {
    const basePrice = parseFloat(productData.price) || 0;
    
    // AI-driven pricing factors
    const marketPotentialMultiplier = 1 + (marketPotential * 0.3);
    const competitionMultiplier = 1 - (competitionLevel * 0.15);
    const trendMultiplier = 1 + ((marketPotential + (1 - competitionLevel)) * 0.1);
    
    let recommendedPrice = basePrice * marketPotentialMultiplier * competitionMultiplier * trendMultiplier;
    
    // Psychological pricing
    recommendedPrice = Math.ceil(recommendedPrice * 100) / 100;
    if (recommendedPrice > 10) {
      recommendedPrice = Math.floor(recommendedPrice) - 0.01; // $XX.99 pattern
    }

    return Math.max(recommendedPrice, basePrice * 0.8); // Don't recommend below 80% of base
  }

  /**
   * Generate AI insights using advanced analysis
   */
  private async generateInsights(productData: any, analysisData: any): Promise<string[]> {
    const insights: string[] = [];

    // Market insights
    if (analysisData.marketPotential > 0.7) {
      insights.push('High market potential detected in current category');
    }
    if (analysisData.competitionLevel < 0.4) {
      insights.push('Low competition level presents good opportunity');
    }
    if (analysisData.trendScore > 0.7) {
      insights.push('Product aligns with current market trends');
    }

    // Pricing insights
    const priceVsRecommended = analysisData.recommendedPrice / parseFloat(productData.price || 1);
    if (priceVsRecommended > 1.2) {
      insights.push('Significant pricing upside potential identified');
    } else if (priceVsRecommended < 0.9) {
      insights.push('Current pricing may be above optimal market rate');
    }

    // Category insights
    if (analysisData.category === 'Electronics') {
      insights.push('Electronics category shows strong seasonal patterns');
    }
    if (analysisData.category === 'Home & Garden') {
      insights.push('Home & Garden sector experiencing steady growth');
    }

    // Sentiment insights
    if (analysisData.sentiment > 0.5) {
      insights.push('Positive product sentiment indicates good customer reception');
    } else if (analysisData.sentiment < -0.3) {
      insights.push('Negative sentiment detected - review marketing approach');
    }

    // Use OpenAI for advanced insights if available
    if (openaiClient && process.env.OPENAI_API_KEY) {
      try {
        const aiInsights = await this.generateAIInsights(productData, analysisData);
        insights.push(...aiInsights);
      } catch (error) {
        logger.warn('OpenAI insights generation failed, using rule-based insights', error);
      }
    }

    return insights.slice(0, 8); // Limit to top 8 insights
  }

  /**
   * Generate insights using OpenAI GPT
   */
  private async generateAIInsights(productData: any, analysisData: any): Promise<string[]> {
    if (!openaiClient) return [];

    try {
      const prompt = `Analyze this product for B2B wholesale opportunities:
      Product: ${productData.title}
      Category: ${analysisData.category}
      Market Potential: ${analysisData.marketPotential}
      Competition: ${analysisData.competitionLevel}
      Trend Score: ${analysisData.trendScore}
      
      Provide 3 strategic insights for B2B sourcing, pricing, and market positioning.`;

      const response = await openaiClient.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a B2B product research expert.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 300,
      });

      const aiResponse = response.choices[0]?.message?.content || '';
      return aiResponse.split('\n').filter(insight => insight.trim().length > 0);
    } catch (error) {
      logger.error('OpenAI API call failed', error);
      return [];
    }
  }

  /**
   * Calculate overall confidence score
   */
  private calculateConfidence(marketPotential: number, competitionLevel: number, trendScore: number): number {
    // Confidence increases with high market potential and trend score, decreases with high competition
    const confidence = (marketPotential * 0.4) + (trendScore * 0.4) + ((1 - competitionLevel) * 0.2);
    return Math.min(Math.max(confidence, 0), 1);
  }

  /**
   * Get historical performance data
   */
  private async getHistoricalPerformance(productId: string): Promise<number | null> {
    try {
      const result = await query(
        'SELECT sales_count, profit_margin FROM products WHERE shopify_id = $1',
        [productId]
      );

      if (result.rows.length > 0) {
        const { sales_count, profit_margin } = result.rows[0];
        // Normalize to 0-1 range
        return Math.min((sales_count / 100) + (profit_margin / 100), 1);
      }

      return null;
    } catch (error) {
      logger.error('Failed to get historical performance', error);
      return null;
    }
  }

  /**
   * Store research results in database
   */
  private async storeResearch(research: ProductResearch): Promise<void> {
    try {
      await query(
        `INSERT INTO product_research (product_id, title, description, category, tags, 
         sentiment_score, market_potential, competition_level, trend_score, 
         recommended_price, confidence, insights, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
         ON CONFLICT (product_id) 
         DO UPDATE SET
           market_potential = EXCLUDED.market_potential,
           competition_level = EXCLUDED.competition_level,
           trend_score = EXCLUDED.trend_score,
           recommended_price = EXCLUDED.recommended_price,
           confidence = EXCLUDED.confidence,
           insights = EXCLUDED.insights,
           updated_at = NOW()`,
        [
          research.productId,
          research.title,
          research.description,
          research.category,
          JSON.stringify(research.tags),
          research.sentimentScore,
          research.marketPotential,
          research.competitionLevel,
          research.trendScore,
          research.recommendedPrice,
          research.confidence,
          JSON.stringify(research.insights),
        ]
      );
    } catch (error) {
      logger.error('Failed to store research results', error);
    }
  }

  /**
   * Batch analyze multiple products
   */
  async analyzeProducts(products: any[]): Promise<ProductResearch[]> {
    logger.info(`Batch analyzing ${products.length} products`);
    
    const results = await Promise.all(
      products.map(product => this.analyzeProduct(product))
    );

    logger.info(`Batch analysis completed for ${products.length} products`);
    return results;
  }

  /**
   * Get market trends for a category
   */
  async getMarketTrends(category: string, limit: number = 10): Promise<MarketTrend[]> {
    const cacheKey = `${category}_${limit}`;
    
    if (this.trendCache.has(cacheKey)) {
      return this.trendCache.get(cacheKey)!;
    }

    // Simulated trend data (in real implementation, would use external APIs)
    const trends: MarketTrend[] = [
      {
        trend: 'Sustainable packaging',
        category,
        growthRate: 0.25,
        timeframe: '6 months',
        confidence: 0.85,
        keywords: ['eco', 'sustainable', 'green', 'biodegradable'],
        relatedProducts: ['eco-friendly containers', 'sustainable bags', 'green packaging'],
      },
      {
        trend: 'Smart home integration',
        category,
        growthRate: 0.30,
        timeframe: '3 months',
        confidence: 0.90,
        keywords: ['smart', 'iot', 'connected', 'automated'],
        relatedProducts: ['smart plugs', 'home automation', 'connected devices'],
      },
      {
        trend: 'Premium minimalism',
        category,
        growthRate: 0.20,
        timeframe: '4 months',
        confidence: 0.80,
        keywords: ['premium', 'minimalist', 'luxury', 'quality'],
        relatedProducts: ['premium accessories', 'minimalist designs', 'luxury items'],
      },
    ];

    this.trendCache.set(cacheKey, trends);
    return trends.slice(0, limit);
  }

  /**
   * Analyze competitors
   */
  async analyzeCompetitors(competitorNames: string[]): Promise<CompetitorAnalysis[]> {
    const analyses: CompetitorAnalysis[] = [];

    for (const competitor of competitorNames) {
      const cacheKey = `competitor_${competitor}`;
      
      if (this.competitorCache.has(cacheKey)) {
        analyses.push(this.competitorCache.get(cacheKey)!);
        continue;
      }

      // Simulated competitor analysis (in real implementation, would scrape competitor data)
      const analysis: CompetitorAnalysis = {
        competitorName: competitor,
        marketShare: Math.random() * 0.3 + 0.05, // 5-35% market share
        pricingStrategy: Math.random() > 0.5 ? 'Premium' : 'Competitive',
        productCount: Math.floor(Math.random() * 1000) + 100,
        averagePrice: Math.random() * 100 + 20,
        strengths: ['Brand recognition', 'Product variety', 'Customer service'].slice(0, Math.floor(Math.random() * 3) + 1),
        weaknesses: ['Higher prices', 'Limited innovation', 'Shipping times'].slice(0, Math.floor(Math.random() * 2) + 1),
        opportunities: ['Market expansion', 'Product line extension', 'Price optimization'],
      };

      this.competitorCache.set(cacheKey, analysis);
      analyses.push(analysis);
    }

    return analyses;
  }

  /**
   * Clear caches
   */
  clearCache(): void {
    this.researchCache.clear();
    this.trendCache.clear();
    this.competitorCache.clear();
    logger.info('AI research cache cleared');
  }
}

export const aiProductResearchService = new AIProductResearchService();