-- AI-Powered Product Intelligence Database Schema Extensions

-- Product research results table
CREATE TABLE IF NOT EXISTS product_research (
  id SERIAL PRIMARY KEY,
  product_id VARCHAR(50) UNIQUE REFERENCES products(shopify_id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  category VARCHAR(100),
  tags JSONB,
  sentiment_score DECIMAL(3, 2),
  market_potential DECIMAL(3, 2),
  competition_level DECIMAL(3, 2),
  trend_score DECIMAL(3, 2),
  recommended_price DECIMAL(10, 2),
  confidence DECIMAL(3, 2),
  insights JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Market trends table
CREATE TABLE IF NOT EXISTS market_trends (
  id SERIAL PRIMARY KEY,
  trend VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  growth_rate DECIMAL(5, 2),
  timeframe VARCHAR(50),
  confidence DECIMAL(3, 2),
  keywords JSONB,
  related_products JSONB,
  source VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Competitor analysis table
CREATE TABLE IF NOT EXISTS competitor_analysis (
  id SERIAL PRIMARY KEY,
  competitor_name VARCHAR(255) UNIQUE NOT NULL,
  market_share DECIMAL(5, 2),
  pricing_strategy VARCHAR(50),
  product_count INT,
  average_price DECIMAL(10, 2),
  strengths JSONB,
  weaknesses JSONB,
  opportunities JSONB,
  last_analyzed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Competitor product tracking
CREATE TABLE IF NOT EXISTS competitor_products (
  id SERIAL PRIMARY KEY,
  competitor_id INT REFERENCES competitor_analysis(id) ON DELETE CASCADE,
  product_title TEXT,
  product_url TEXT,
  price DECIMAL(10, 2),
  category VARCHAR(100),
  availability BOOLEAN,
  rating DECIMAL(3, 2),
  review_count INT,
  first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  price_history JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Market opportunities table
CREATE TABLE IF NOT EXISTS market_opportunities (
  id SERIAL PRIMARY KEY,
  opportunity_type VARCHAR(100),
  title TEXT,
  description TEXT,
  category VARCHAR(100),
  potential_revenue DECIMAL(15, 2),
  investment_required DECIMAL(15, 2),
  risk_level VARCHAR(20),
  time_to_market INT,
  confidence DECIMAL(3, 2),
  keywords JSONB,
  data_sources JSONB,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pricing history table
CREATE TABLE IF NOT EXISTS pricing_history (
  id SERIAL PRIMARY KEY,
  product_id VARCHAR(50) REFERENCES products(shopify_id) ON DELETE CASCADE,
  price DECIMAL(10, 2),
  competitor_price DECIMAL(10, 2),
  recommended_price DECIMAL(10, 2),
  price_change DECIMAL(5, 2),
  change_reason TEXT,
  source VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI model performance metrics
CREATE TABLE IF NOT EXISTS ai_model_metrics (
  id SERIAL PRIMARY KEY,
  model_name VARCHAR(100),
  model_version VARCHAR(50),
  metric_type VARCHAR(50),
  metric_value DECIMAL(10, 4),
  additional_data JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Search trends table
CREATE TABLE IF NOT EXISTS search_trends (
  id SERIAL PRIMARY KEY,
  keyword VARCHAR(255) NOT NULL,
  search_volume BIGINT,
  trend_direction VARCHAR(10),
  category VARCHAR(100),
  geographic_data JSONB,
  related_keywords JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Social media signals table
CREATE TABLE IF NOT EXISTS social_media_signals (
  id SERIAL PRIMARY KEY,
  platform VARCHAR(50),
  signal_type VARCHAR(50),
  content TEXT,
  url TEXT,
  engagement_score INT,
  sentiment_score DECIMAL(3, 2),
  keywords JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Supplier AI scoring table
CREATE TABLE IF NOT EXISTS supplier_ai_scores (
  id SERIAL PRIMARY KEY,
  supplier_id INT REFERENCES suppliers(id) ON DELETE CASCADE,
  overall_score DECIMAL(3, 2),
  reliability_score DECIMAL(3, 2),
  cost_score DECIMAL(3, 2),
  quality_score DECIMAL(3, 2),
  speed_score DECIMAL(3, 2),
  communication_score DECIMAL(3, 2),
  risk_score DECIMAL(3, 2),
  trend_score DECIMAL(3, 2),
  factors JSONB,
  last_scored TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Demand forecasting table
CREATE TABLE IF NOT EXISTS demand_forecasts (
  id SERIAL PRIMARY KEY,
  product_id VARCHAR(50) REFERENCES products(shopify_id) ON DELETE CASCADE,
  forecast_type VARCHAR(50),
  forecast_period VARCHAR(50),
  predicted_demand INT,
  confidence DECIMAL(3, 2),
  factors JSONB,
  model_version VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_research_product_id ON product_research(product_id);
CREATE INDEX IF NOT EXISTS idx_product_research_category ON product_research(category);
CREATE INDEX IF NOT EXISTS idx_product_research_market_potential ON product_research(market_potential);
CREATE INDEX IF NOT EXISTS idx_product_research_trend_score ON product_research(trend_score);
CREATE INDEX IF NOT EXISTS idx_market_trends_category ON market_trends(category);
CREATE INDEX IF NOT EXISTS idx_market_trends_trend ON market_trends(trend);
CREATE INDEX IF NOT EXISTS idx_competitor_products_competitor_id ON competitor_products(competitor_id);
CREATE INDEX IF NOT EXISTS idx_competitor_products_category ON competitor_products(category);
CREATE INDEX IF NOT EXISTS idx_market_opportunities_status ON market_opportunities(status);
CREATE INDEX IF NOT EXISTS idx_market_opportunities_category ON market_opportunities(category);
CREATE INDEX IF NOT EXISTS idx_pricing_history_product_id ON pricing_history(product_id);
CREATE INDEX IF NOT EXISTS idx_pricing_history_created_at ON pricing_history(created_at);
CREATE INDEX IF NOT EXISTS idx_search_trends_keyword ON search_trends(keyword);
CREATE INDEX IF NOT EXISTS idx_social_media_signals_platform ON social_media_signals(platform);
CREATE INDEX IF NOT EXISTS idx_social_media_signals_created_at ON social_media_signals(created_at);
CREATE INDEX IF NOT EXISTS idx_supplier_ai_scores_supplier_id ON supplier_ai_scores(supplier_id);
CREATE INDEX IF NOT EXISTS idx_demand_forecasts_product_id ON demand_forecasts(product_id);

-- Triggers for updated_at
CREATE TRIGGER update_product_research_updated_at BEFORE UPDATE ON product_research
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_market_trends_updated_at BEFORE UPDATE ON market_trends
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_competitor_analysis_updated_at BEFORE UPDATE ON competitor_analysis
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_competitor_products_updated_at BEFORE UPDATE ON competitor_products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_market_opportunities_updated_at BEFORE UPDATE ON market_opportunities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_supplier_ai_scores_updated_at BEFORE UPDATE ON supplier_ai_scores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();