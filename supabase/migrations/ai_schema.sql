-- B2B Wholesale Automation Database Schema for Supabase
-- This schema is compatible with Supabase PostgreSQL

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL, -- 'AutoDS', 'Wholesale2B', 'Duoplane'
  priority INT NOT NULL DEFAULT 1,
  api_key TEXT,
  api_endpoint TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
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
  last_synced TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sync logs table
CREATE TABLE IF NOT EXISTS sync_logs (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50) NOT NULL, -- catalog/pricing/fulfillment/inventory
  status VARCHAR(20) NOT NULL, -- success/failed/in_progress
  details JSONB,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Price lists table for B2B pricing
CREATE TABLE IF NOT EXISTS price_lists (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  sparklayer_price_list_id VARCHAR(100),
  discount_percentage DECIMAL(5, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Customer price list mappings
CREATE TABLE IF NOT EXISTS customer_price_lists (
  id SERIAL PRIMARY KEY,
  customer_id INT REFERENCES b2b_customers(id),
  price_list_id INT REFERENCES price_lists(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
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

-- Supabase specific: Row Level Security (RLS) policies
-- These policies restrict access based on user authentication - adjust as needed

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_price_lists ENABLE ROW LEVEL SECURITY;

-- Default policies (for development - restrict in production)
CREATE POLICY "Allow all access for development" ON suppliers
  FOR ALL USING (true);
  
CREATE POLICY "Allow all access for development" ON products
  FOR ALL USING (true);
  
CREATE POLICY "Allow all access for development" ON b2b_customers
  FOR ALL USING (true);
  
CREATE POLICY "Allow all access for development" ON order_mappings
  FOR ALL USING (true);
  
CREATE POLICY "Allow all access for development" ON sync_logs
  FOR ALL USING (true);
  
CREATE POLICY "Allow all access for development" ON price_lists
  FOR ALL USING (true);
  
CREATE POLICY "Allow all access for development" ON customer_price_lists
  FOR ALL USING (true);

-- Trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
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

-- Supabase specific function for real-time subscriptions
-- This function can be used to trigger real-time updates
CREATE OR REPLACE FUNCTION notify_table_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    TG_TABLE_NAME || '_change',
    json_build_object(
      'operation', TG_OP,
      'table', TG_TABLE_NAME,
      'old_data', row_to_json(OLD),
      'new_data', row_to_json(NEW)
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for real-time notifications (optional)
-- CREATE TRIGGER suppliers_notify AFTER INSERT OR UPDATE OR DELETE ON suppliers
--   FOR EACH ROW EXECUTE FUNCTION notify_table_change();

-- Insert default suppliers
INSERT INTO suppliers (name, priority, is_active) VALUES
('AutoDS', 1, true),
('Wholesale2B', 2, true),
('Duoplane', 3, true)
ON CONFLICT DO NOTHING;