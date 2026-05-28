# Architecture Documentation

## System Overview

The B2B AutoShipper is a middleware layer that sits between Shopify and various wholesale suppliers, providing intelligent automation for B2B order fulfillment.

## Core Components

### 1. API Layer (Express.js)
- **Webhook Handlers**: Receives webhooks from Shopify and AfterShip
- **REST Endpoints**: Health checks and administrative functions
- **Middleware**: Request logging, error handling, security

### 2. Service Layer
- **SynceeService**: Product catalog synchronization
- **SparkLayerService**: B2B pricing and customer management
- **AutoDSService**: Order fulfillment via AutoDS
- **AfterShipService**: Shipment tracking
- **RoutingEngine**: Intelligent supplier selection

### 3. Queue Layer (BullMQ + Redis)
- **Job Queues**: Background processing for async operations
- **Workers**: Process jobs with retry logic and error handling
- **Monitoring**: Bull Board dashboard for queue visibility

### 4. Data Layer (PostgreSQL)
- **Relational Data**: Products, customers, orders, suppliers
- **Sync Logs**: Audit trail for all synchronization operations
- **Connection Pooling**: Efficient database connection management

### 5. Utilities
- **Logger**: Winston-based structured logging
- **Monitoring**: Health checks, Slack alerts, optional Sentry
- **Error Handling**: Custom error types and async error wrappers

## Data Flow

### Order Fulfillment Flow

```
1. Shopify Order Created
   ↓
2. Webhook Received (shopifyOrderCreateHandler)
   ↓
3. B2B Order Check (tags, company, metadata)
   ↓
4. Fulfillment Job Queued (BullMQ)
   ↓
5. Worker Processes Job (fulfillmentWorker)
   ↓
6. Supplier Selection (RoutingEngine)
   - Stock availability check
   - Price comparison
   - Shipping time evaluation
   - Reliability scoring
   ↓
7. Order Split (if multi-supplier)
   ↓
8. Supplier Order Placement (AutoDSService)
   ↓
9. Tracking Creation (AfterShipService)
   ↓
10. Database Update (order_mappings)
   ↓
11. Customer Notification (via AfterShip)
```

### Catalog Sync Flow

```
1. Cron Job Triggered (every 30 min)
   ↓
2. Catalog Sync Job Queued
   ↓
3. Worker Processes Job (catalogSyncWorker)
   ↓
4. Fetch Updated Products (SynceeService)
   ↓
5. Transform Product Data
   - Calculate wholesale prices
   - Map variants
   - Format for Shopify
   ↓
6. Update Database (products table)
   ↓
7. Push to SparkLayer (optional)
   ↓
8. Log Sync Results (sync_logs)
```

### Customer Management Flow

```
1. Shopify Customer Created/Updated
   ↓
2. Webhook Received
   ↓
3. B2B Customer Check
   ↓
4. B2B Customer Job Queued
   ↓
5. Worker Processes Job (b2bCustomerWorker)
   ↓
6. Create Company in SparkLayer
   - Assign price list
   - Set net terms
   - Configure approval status
   ↓
7. Update Database (b2b_customers)
   ↓
8. Sync Pricing (if applicable)
```

## Database Schema

### Core Tables

**suppliers**
- Stores supplier configurations and API credentials
- Priority-based routing
- Active/inactive status

**products**
- Product catalog with Shopify and supplier mappings
- Pricing information (wholesale/retail)
- Inventory levels
- Sync timestamps

**b2b_customers**
- B2B customer information
- SparkLayer company mappings
- Approval workflow
- Price list assignments

**order_mappings**
- Links Shopify orders to supplier orders
- Tracking information
- Fulfillment status
- Error logging

**sync_logs**
- Audit trail for all sync operations
- Success/failure status
- Detailed JSON logs
- Performance metrics

**price_lists**
- SparkLayer price list configurations
- Discount rules
- Customer group assignments

## Queue Architecture

### Queue Types

1. **fulfillment**: High priority order processing
2. **catalog-sync**: Medium priority product updates
3. **pricing-sync**: Lower priority pricing updates
4. **inventory-sync**: Lower priority stock updates
5. **b2b-customer**: High priority customer processing
6. **tracking-update**: Medium priority tracking updates

### Job Configuration

- **Retry Policy**: 3 attempts with exponential backoff
- **Priority**: Orders get highest priority
- **Cleanup**: Remove completed jobs after 1 hour, failed after 24 hours
- **Concurrency**: Workers process multiple jobs in parallel

### Worker Scaling

Workers can be scaled horizontally:
- Multiple worker processes
- Distributed across servers
- Shared Redis queue
- Automatic load balancing

## Routing Engine

### Scoring Algorithm

The routing engine uses a weighted scoring system:

1. **Stock Availability (40%)**: Can supplier fulfill the order?
2. **Price Optimization (30%)**: Is the supplier competitive?
3. **Shipping Speed (20%)**: How fast can they deliver?
4. **Reliability (10%)**: Historical performance metrics

### Supplier Selection Process

1. Load active suppliers from database
2. Evaluate each supplier against routing rules
3. Calculate weighted scores
4. Apply priority multipliers
5. Select highest-scoring supplier
6. Handle order splitting if needed

### Fallback Logic

- If primary supplier fails, try alternatives
- Automatic retry with different suppliers
- Manual intervention option for critical failures

## Error Handling

### Error Types

- **AutomationError**: Base error for all automation failures
- **SupplierError**: Supplier-specific failures
- **SyncError**: Data synchronization failures
- **FulfillmentError**: Order fulfillment failures
- **APIError**: External API failures

### Error Recovery

- Automatic retry with exponential backoff
- Dead letter queue for failed jobs
- Manual retry via Bull Board
- Alert notifications (Slack, email)

### Logging Strategy

- Structured logging with Winston
- Log levels: error, warn, info, debug
- Contextual information in all logs
- Separate error logs in production

## Security

### Webhook Verification

- Shopify: HMAC signature verification
- AfterShip: Signature verification (optional)
- Timestamp validation
- Replay attack prevention

### API Security

- Environment variable storage for secrets
- No hardcoded credentials
- HTTPS only in production
- Rate limiting recommended

### Data Security

- Database encryption at rest
- SSL/TLS for connections
- Input validation and sanitization
- SQL injection prevention (parameterized queries)

## Monitoring

### Health Checks

- Database connectivity
- Redis connectivity
- Queue status
- Worker availability

### Performance Metrics

- Job processing times
- API response times
- Database query performance
- Error rates by type

### Alerts

- Slack webhooks for critical errors
- Optional Sentry integration
- Email alerts for sync failures
- Dashboard for real-time monitoring

## Scalability Considerations

### Database Scaling

- Read replicas for reporting
- Connection pooling
- Query optimization
- Indexing strategy

### Queue Scaling

- Redis clustering for high availability
- Horizontal worker scaling
- Queue priority management
- Job batching for bulk operations

### Application Scaling

- Stateless design for horizontal scaling
- Load balancer compatibility
- Session management (if needed)
- Caching layer (Redis)

## Deployment Architecture

### Development

- Local PostgreSQL and Redis
- Hot reload with nodemon
- Debug logging enabled
- Test webhooks via local tunnel

### Production

- Managed PostgreSQL (RDS, Neon, etc.)
- Managed Redis (ElastiCache, Upstash, etc.)
- Process manager (PM2, Docker)
- Load balancer (Nginx, AWS ALB)
- SSL termination

### Cloud Deployment Options

- **Vercel**: Serverless functions for webhooks
- **Render**: Full application hosting
- **AWS**: EC2, RDS, ElastiCache
- **DigitalOcean**: App Platform, Managed Databases
- **Heroku**: Dynos, Heroku Postgres, Heroku Redis

## Future Enhancements

### Potential Improvements

1. **Advanced Routing**: Machine learning for supplier selection
2. **Multi-Channel**: Support for additional sales channels
3. **Analytics Dashboard**: Business intelligence and reporting
4. **Mobile App**: On-the-go order management
5. **AI Integration**: Predictive inventory management
6. **Blockchain**: Supply chain transparency
7. **Advanced Analytics**: Customer behavior analysis

### Integration Opportunities

- **Accounting**: QuickBooks, Xero integration
- **CRM**: Salesforce, HubSpot integration
- **Email**: Marketing automation
- **SMS**: Order notifications
- **Marketplaces**: Amazon, eBay integration

---

This architecture provides a solid foundation for B2B wholesale automation with room for growth and customization.