# B2B AutoShipper

A comprehensive B2B wholesale automation system built with Node.js, TypeScript, and Express. This system integrates Shopify, SparkLayer, AutoDS, Syncee, and AfterShip to create a fully automated dropshipping operation for wholesale orders.

## 🚀 Features

- **Automated Catalog Sync**: Sync product catalogs from Syncee to Shopify and SparkLayer
- **B2B Customer Management**: Handle B2B customer approvals and pricing via SparkLayer
- **Intelligent Order Routing**: Smart supplier selection based on price, stock, and reliability
- **Automated Fulfillment**: Route orders to suppliers (AutoDS, Wholesale2B, Duoplane) automatically
- **Tracking Management**: Track shipments via AfterShip and update customers automatically
- **Queue-Based Processing**: BullMQ with Redis for reliable background job processing
- **Real-time Monitoring**: Built-in dashboard for queue monitoring and health checks
- **Error Handling**: Comprehensive error handling with Slack alerts and logging
- **🤖 AI-Powered Product Intelligence**: Advanced AI system for market analysis and automation
- **📊 Predictive Analytics**: Neural network-powered demand forecasting and trend prediction
- **🎯 Real-Time Competitor Monitoring**: Automated competitor price and catalog tracking
- **💡 Intelligent Opportunity Detection**: AI-driven market gap and opportunity identification
- **💰 Dynamic Pricing Optimization**: AI-based pricing with multi-factor analysis
- **🏆 Smart Supplier Scoring**: AI-powered supplier evaluation and ranking

## 📋 Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│  Shopify    │─────▶│  Middleware  │─────▶│   AutoDS    │
│  Store      │      │   (Node.js)  │      │  Supplier   │
└─────────────┘      └──────────────┘      └─────────────┘
      │                      │                      │
      │                      ▼                      │
      │             ┌──────────────┐                │
      └────────────▶│  SparkLayer  │◀───────────────┘
                     │  B2B Portal  │
                     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │  AfterShip   │
                     │  Tracking    │
                     └──────────────┘

Additional Integrations:
- Syncee: Product catalog sync
- Redis: Queue management
- PostgreSQL: Data persistence
```

## 🛠️ Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL or Supabase (managed PostgreSQL)
- **Queue**: BullMQ with Redis
- **Monitoring**: Winston logging + optional Sentry
- **Alerts**: Slack webhooks
- **Dashboard**: Bull Board for queue monitoring

## 📦 Installation

### Prerequisites

- Node.js 18+ 
- PostgreSQL 14+ OR Supabase account
- Redis 7+
- API keys for all integrated services

### Setup Steps

1. **Clone the repository**
```bash
git clone <repository-url>
cd B2B_autoshipper
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env
# Edit .env with your actual API keys and configuration
```

4. **Set up database**

**Option A: Standard PostgreSQL**
```bash
# Create database
createdb b2b_autoshipper

# Initialize schema
npm run init-db
# Or manually: psql -d b2b_autoshipper -f src/db/schema.sql
```

**Option B: Supabase (Recommended)**
```bash
# Follow the Supabase setup guide
# See SUPABASE_SETUP.md for detailed instructions
```

Configure your choice in `.env`:
```env
# For standard PostgreSQL
USE_SUPABASE=false

# For Supabase
USE_SUPABASE=true
DATABASE_CONNECTION_STRING=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
SUPABASE_URL=https://[project-ref].supabase.co
SUPABASE_KEY=your_supabase_anon_key
```

5. **Start Redis**
```bash
redis-server
```

6. **Start the application**
```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start
```

## 🔧 Configuration

### Environment Variables

See `.env.example` for all required environment variables:

- **Database**: PostgreSQL connection settings
- **Redis**: Connection settings for queue management
- **Shopify**: Store URL, API keys, and webhook secrets
- **SparkLayer**: Site ID and API credentials
- **AutoDS**: API key and secret
- **Syncee**: API credentials
- **AfterShip**: API key
- **Monitoring**: Optional Sentry DSN and Slack webhook URL

### Shopify Webhook Configuration

Configure these webhooks in your Shopify admin:

```
POST https://your-domain.com/webhooks/shopify/orders/create
POST https://your-domain.com/webhooks/shopify/orders/updated
POST https://your-domain.com/webhooks/shopify/customers/create
POST https://your-domain.com/webhooks/shopify/customers/update
POST https://your-domain.com/webhooks/shopify/products/update
```

### AfterShip Webhook Configuration

Configure tracking update webhooks in your AfterShip dashboard:

```
POST https://your-domain.com/webhooks/aftership/tracking
```

## 📊 Monitoring

### Bull Board Dashboard

Access the queue monitoring dashboard at:
```
http://localhost:3000/admin/queues
```

### Health Check

Check system health:
```
http://localhost:3000/webhooks/health
```

### Logs

Logs are stored in the `logs/` directory in production mode:
- `combined.log`: All logs
- `error.log`: Error logs only

## 🔄 Scheduled Jobs

The system runs these scheduled jobs automatically:

- **Catalog Sync**: Every 30 minutes
- **Pricing Sync**: Every hour
- **Inventory Sync**: Every 2 hours

## 🧪 Testing

Run tests:
```bash
npm test
```

## 🚢 Deployment

### Vercel (Serverless)

1. Install Vercel CLI
2. Deploy: `vercel`
3. Configure environment variables in Vercel dashboard

### Traditional Hosting

1. Build the project: `npm run build`
2. Set up PM2: `pm2 start dist/server.js --name b2b-autoshipper`
3. Configure nginx as reverse proxy
4. Set up SSL certificates

### Docker (Optional)

Create a `Dockerfile`:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## 📈 Scaling

### High Volume Operations

For operations exceeding 100 orders/day, consider:

1. **Database Optimization**
   - Add read replicas
   - Implement connection pooling
   - Add database indexes

2. **Queue Scaling**
   - Add Redis Cluster
   - Increase worker concurrency
   - Implement queue priorities

3. **Caching**
   - Add Redis caching for frequently accessed data
   - Implement CDN for static assets

4. **Load Balancing**
   - Deploy multiple instances behind a load balancer
   - Use sticky sessions for websockets

## 🔒 Security

- All webhooks are verified using HMAC signatures
- API keys are stored in environment variables
- Database connections use SSL
- Rate limiting is recommended for production
- Regular security updates for dependencies

## 🐛 Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check PostgreSQL is running (standard setup)
   - Verify connection strings in `.env`
   - Ensure database exists
   - For Supabase: Check project is active and connection string is correct
   - See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for Supabase-specific issues

2. **Redis Connection Failed**
   - Check Redis is running: `redis-cli ping`
   - Verify Redis configuration in `.env`

3. **Webhook Verification Failing**
   - Ensure webhook secrets match exactly
   - Check webhook URL is accessible publicly
   - Verify webhook payload format

4. **Jobs Not Processing**
   - Check Bull Board dashboard
   - Verify Redis connection
   - Check worker logs

5. **Supabase Authentication Issues**
   - Verify RLS policies in Supabase dashboard
   - Check service role key for admin operations
   - Ensure proper authentication setup

## 📞 Support

For issues and questions:
- Check logs in `logs/` directory
- Review Bull Board dashboard
- Enable debug logging in development mode
- See [SETUP.md](SETUP.md) for detailed setup instructions
- See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for Supabase configuration
- See [ARCHITECTURE.md](ARCHITECTURE.md) for system architecture details
- See [ARCHITECTURE_AI.md](ARCHITECTURE_AI.md) for AI system architecture
- See [AI_IMPLEMENTATION_SUMMARY.md](AI_IMPLEMENTATION_SUMMARY.md) for AI implementation details

## 📄 License

ISC

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

---

**Built with ❤️ for B2B wholesale automation**