-- B2B Wholesale Automation Database Schema

-- Suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL, -- 'AutoDS', 'Wholesale2B', 'Duoplane'
  priority INT NOT NULL DEFAULT 1,
  api_key TEXT,
  api_endpoint TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
  shopify_id VARCHAR(50) PRIMARY KEY,
  syncee_id VARCHAR(100),
  supplier_id INT REFERENCES suppliers(id),
  wholesale_price DECIMAL(10, 2),
  retail_price DECIMAL(10, 2),
  sku VARCHAR(100),
  title TEXT,
  description TEXT,
  inventory_count INT DEFAULT 0,
  last_synced TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- B2B Customers table
CREATE TABLE IF NOT EXISTS b2b_customers (
  id SERIAL PRIMARY KEY,
  shopify_customer_id VARCHAR(50) UNIQUE,
  sparklayer_company_id VARCHAR(100),
  price_list_id VARCHAR(100),
  approval_status VARCHAR(20) DEFAULT 'pending', -- pending/approved/rejected
  net_terms INT DEFAULT 0,
  company_name TEXT,
  email TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Order mappings table
CREATE TABLE IF NOT EXISTS order_mappings (
  id SERIAL PRIMARY KEY,
  shopify_order_id VARCHAR(50) UNIQUE NOT NULL,
  fulfillment_status VARCHAR(50) DEFAULT 'pending',
  supplier_order_id VARCHAR(100),
  supplier_id INT REFERENCES suppliers(id),
  tracking_number VARCHAR(100),
  tracking_url TEXT,
  error_log TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Sync logs table
CREATE TABLE IF NOT EXISTS sync_logs (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50) NOT NULL, -- catalog/pricing/fulfillment/inventory
  status VARCHAR(20) NOT NULL, -- success/failed/in_progress
  details JSONB,
  error_message TEXT,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Price lists table for B2B pricing
CREATE TABLE IF NOT EXISTS price_lists (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  sparklayer_price_list_id VARCHAR(100),
  discount_percentage DECIMAL(5, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Customer price list mappings
CREATE TABLE IF NOT EXISTS customer_price_lists (
  id SERIAL PRIMARY KEY,
  customer_id INT REFERENCES b2b_customers(id),
  price_list_id INT REFERENCES price_lists(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_syncee ON products(syncee_id);
CREATE INDEX IF NOT EXISTS idx_b2b_customers_sparklayer ON b2b_customers(sparklayer_company_id);
CREATE INDEX IF NOT EXISTS idx_order_mappings_shopify ON order_mappings(shopify_order_id);
CREATE INDEX IF NOT EXISTS idx_order_mappings_supplier ON order_mappings(supplier_order_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_type ON sync_logs(type);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_sync_logs_created_at ON sync_logs(started_at);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON suppliers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_b2b_customers_updated_at BEFORE UPDATE ON b2b_customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_order_mappings_updated_at BEFORE UPDATE ON order_mappings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_price_lists_updated_at BEFORE UPDATE ON price_lists
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();