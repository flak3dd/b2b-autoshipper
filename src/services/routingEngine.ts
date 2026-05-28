import { logger } from '../utils/logger';
import { query } from '../db/connection';
import { autoDSService } from './autoDSService';

interface Supplier {
  id: number;
  name: string;
  priority: number;
  api_key: string;
  is_active: boolean;
}

interface ProductSupplierMapping {
  productId: string;
  supplierId: number;
  stockLevel: number;
  wholesalePrice: number;
  shippingTime: number; // in days
}

interface OrderRoutingScore {
  supplier: Supplier;
  score: number;
  reasons: string[];
}

interface RoutingRule {
  priority: number;
  condition: string;
  supplierPreference: string[];
  weight: number;
}

class RoutingEngine {
  private suppliers: Map<string, Supplier> = new Map();
  private routingRules: RoutingRule[] = [];

  constructor() {
    this.initializeRoutingRules();
  }

  private initializeRoutingRules(): void {
    this.routingRules = [
      {
        priority: 1,
        condition: 'stock_available',
        supplierPreference: ['AutoDS', 'Wholesale2B'],
        weight: 0.4, // 40% weight for stock availability
      },
      {
        priority: 2,
        condition: 'price_optimization',
        supplierPreference: ['AutoDS'],
        weight: 0.3, // 30% weight for price
      },
      {
        priority: 3,
        condition: 'shipping_speed',
        supplierPreference: ['AutoDS'],
        weight: 0.2, // 20% weight for shipping speed
      },
      {
        priority: 4,
        condition: 'reliability',
        supplierPreference: ['AutoDS'],
        weight: 0.1, // 10% weight for reliability
      },
    ];
  }

  async loadSuppliers(): Promise<void> {
    try {
      const result = await query(
        'SELECT id, name, priority, api_key, is_active FROM suppliers WHERE is_active = true ORDER BY priority ASC'
      );

      this.suppliers.clear();
      for (const row of result.rows) {
        this.suppliers.set(row.name, row);
      }

      logger.info(`Loaded ${this.suppliers.size} active suppliers`);
    } catch (error) {
      logger.error('Failed to load suppliers', error);
      throw error;
    }
  }

  async selectSupplier(order: any): Promise<string> {
    try {
      await this.loadSuppliers();

      const lineItems = order.line_items || [];
      if (lineItems.length === 0) {
        throw new Error('Order has no line items');
      }

      // Get supplier scores for each product
      const productScores = await Promise.all(
        lineItems.map(async (item: any) => {
          const productId = item.product_id || item.variant_id;
          return await this.evaluateSuppliersForProduct(productId, item.quantity);
        })
      );

      // Aggregate scores to find best overall supplier
      const aggregatedScores = this.aggregateScores(productScores);

      // Select best supplier based on aggregated scores
      const selectedSupplier = this.selectBestSupplier(aggregatedScores);

      logger.info(`Selected supplier ${selectedSupplier.name} for order ${order.id}`, {
        score: selectedSupplier.score,
        reasons: selectedSupplier.reasons,
      });

      return selectedSupplier.supplier.name;
    } catch (error) {
      logger.error(`Failed to select supplier for order ${order.id}`, error);
      // Fallback to default supplier
      return this.getDefaultSupplier();
    }
  }

  private async evaluateSuppliersForProduct(productId: string, quantity: number): Promise<OrderRoutingScore[]> {
    const scores: OrderRoutingScore[] = [];

    for (const [name, supplier] of this.suppliers) {
      const score = await this.calculateSupplierScore(supplier, productId, quantity);
      scores.push(score);
    }

    return scores.sort((a, b) => b.score - a.score);
  }

  private async calculateSupplierScore(supplier: Supplier, productId: string, quantity: number): Promise<OrderRoutingScore> {
    let totalScore = 0;
    const reasons: string[] = [];

    for (const rule of this.routingRules) {
      const ruleScore = await this.evaluateRule(rule, supplier, productId, quantity);
      totalScore += ruleScore.score;
      reasons.push(...ruleScore.reasons);
    }

    // Apply supplier priority multiplier
    const priorityMultiplier = 1 + (10 - supplier.priority) * 0.1; // Higher priority = higher multiplier
    totalScore *= priorityMultiplier;

    return {
      supplier,
      score: totalScore,
      reasons,
    };
  }

  private async evaluateRule(rule: RoutingRule, supplier: Supplier, productId: string, quantity: number): Promise<{ score: number; reasons: string[] }> {
    let score = 0;
    const reasons: string[] = [];

    switch (rule.condition) {
      case 'stock_available':
        const stockLevel = await this.checkStockLevel(supplier, productId);
        if (stockLevel >= quantity) {
          score = rule.weight * 100;
          reasons.push(`${supplier.name} has sufficient stock (${stockLevel} >= ${quantity})`);
        } else {
          score = rule.weight * (stockLevel / quantity) * 50; // Partial score for partial stock
          reasons.push(`${supplier.name} has low stock (${stockLevel} < ${quantity})`);
        }
        break;

      case 'price_optimization':
        const price = await this.getProductPrice(supplier, productId);
        const avgPrice = await this.getAverageProductPrice(productId);
        if (price < avgPrice) {
          score = rule.weight * 100;
          reasons.push(`${supplier.name} offers competitive pricing`);
        } else {
          score = rule.weight * (avgPrice / price) * 50;
          reasons.push(`${supplier.name} pricing is above average`);
        }
        break;

      case 'shipping_speed':
        const shippingTime = await this.getShippingTime(supplier, productId);
        if (shippingTime <= 3) {
          score = rule.weight * 100;
          reasons.push(`${supplier.name} offers fast shipping (${shippingTime} days)`);
        } else if (shippingTime <= 7) {
          score = rule.weight * 70;
          reasons.push(`${supplier.name} offers standard shipping (${shippingTime} days)`);
        } else {
          score = rule.weight * 40;
          reasons.push(`${supplier.name} has slower shipping (${shippingTime} days)`);
        }
        break;

      case 'reliability':
        const reliabilityScore = await this.getReliabilityScore(supplier);
        score = rule.weight * reliabilityScore;
        reasons.push(`${supplier.name} reliability score: ${reliabilityScore}%`);
        break;
    }

    // Apply supplier preference bonus
    if (rule.supplierPreference.includes(supplier.name)) {
      score *= 1.2; // 20% bonus for preferred suppliers
      reasons.push(`${supplier.name} is preferred for ${rule.condition}`);
    }

    return { score, reasons };
  }

  private async checkStockLevel(supplier: Supplier, productId: string): Promise<number> {
    try {
      if (supplier.name === 'AutoDS') {
        return await autoDSService.checkInventory(productId);
      }
      // For other suppliers, you would implement similar inventory checks
      return 100; // Default assumption for other suppliers
    } catch (error) {
      logger.error(`Failed to check stock for ${supplier.name}`, error);
      return 0;
    }
  }

  private async getProductPrice(supplier: Supplier, productId: string): Promise<number> {
    try {
      const result = await query(
        'SELECT wholesale_price FROM products WHERE shopify_id = $1 AND supplier_id = $2',
        [productId, supplier.id]
      );

      if (result.rows.length > 0) {
        return parseFloat(result.rows[0].wholesale_price);
      }

      return 0;
    } catch (error) {
      logger.error(`Failed to get product price for ${supplier.name}`, error);
      return 0;
    }
  }

  private async getAverageProductPrice(productId: string): Promise<number> {
    try {
      const result = await query(
        'SELECT AVG(wholesale_price) as avg_price FROM products WHERE shopify_id = $1',
        [productId]
      );

      if (result.rows.length > 0 && result.rows[0].avg_price) {
        return parseFloat(result.rows[0].avg_price);
      }

      return 0;
    } catch (error) {
      logger.error('Failed to get average product price', error);
      return 0;
    }
  }

  private async getShippingTime(supplier: Supplier, productId: string): Promise<number> {
    try {
      // This would typically come from supplier API or configuration
      // For now, return default values based on supplier
      const shippingTimes: { [key: string]: number } = {
        'AutoDS': 3,
        'Wholesale2B': 5,
        'Duoplane': 2,
      };

      return shippingTimes[supplier.name] || 7;
    } catch (error) {
      logger.error(`Failed to get shipping time for ${supplier.name}`, error);
      return 7;
    }
  }

  private async getReliabilityScore(supplier: Supplier): Promise<number> {
    try {
      // This would typically come from historical performance data
      // For now, return default values based on supplier
      const reliabilityScores: { [key: string]: number } = {
        'AutoDS': 95,
        'Wholesale2B': 85,
        'Duoplane': 98,
      };

      return reliabilityScores[supplier.name] || 80;
    } catch (error) {
      logger.error(`Failed to get reliability score for ${supplier.name}`, error);
      return 80;
    }
  }

  private aggregateScores(productScores: OrderRoutingScore[][]): OrderRoutingScore[] {
    const aggregatedScores: Map<string, OrderRoutingScore> = new Map();

    // Sum scores across all products for each supplier
    for (const scores of productScores) {
      for (const score of scores) {
        const supplierName = score.supplier.name;
        if (aggregatedScores.has(supplierName)) {
          const existing = aggregatedScores.get(supplierName)!;
          existing.score += score.score;
          existing.reasons.push(...score.reasons);
        } else {
          aggregatedScores.set(supplierName, { ...score });
        }
      }
    }

    // Normalize scores by number of products
    const numProducts = productScores.length;
    for (const [name, score] of aggregatedScores) {
      score.score /= numProducts;
    }

    return Array.from(aggregatedScores.values()).sort((a, b) => b.score - a.score);
  }

  private selectBestSupplier(scores: OrderRoutingScore[]): OrderRoutingScore {
    if (scores.length === 0) {
      throw new Error('No suppliers available');
    }

    return scores[0]; // Already sorted by score (descending)
  }

  private getDefaultSupplier(): string {
    // Return highest priority supplier as fallback
    const suppliers = Array.from(this.suppliers.values()).sort((a, b) => a.priority - b.priority);
    if (suppliers.length > 0) {
      logger.warn(`Using default supplier: ${suppliers[0].name}`);
      return suppliers[0].name;
    }

    throw new Error('No suppliers available');
  }

  async splitOrderBySupplier(order: any): Promise<Map<string, any[]>> {
    const supplierMap = new Map<string, any[]>();

    try {
      for (const item of order.line_items) {
        const productId = item.product_id || item.variant_id;
        const supplier = await this.selectSupplier({ line_items: [item] });

        if (!supplierMap.has(supplier)) {
          supplierMap.set(supplier, []);
        }

        supplierMap.get(supplier)!.push(item);
      }

      logger.info(`Order ${order.id} split across ${supplierMap.size} suppliers`, {
        suppliers: Array.from(supplierMap.keys()),
      });

      return supplierMap;
    } catch (error) {
      logger.error(`Failed to split order ${order.id} by supplier`, error);
      throw error;
    }
  }
}

export const routingEngine = new RoutingEngine();