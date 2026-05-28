# Setup Guide

This guide will help you set up the B2B AutoShipper system from scratch.

## Prerequisites

Before you begin, ensure you have:

- Node.js 18 or higher installed
- PostgreSQL 14 or higher
- Redis 7 or higher
- Git
- API accounts for:
  - Shopify (with Admin API access)
  - SparkLayer (Pro/Enterprise plan)
  - AutoDS
  - Syncee
  - AfterShip

## Step 1: Get API Keys

### Shopify
1. Go to Shopify Admin → Apps → Manage private apps
2. Create a new private app with these permissions:
   - Read/write products
   - Read/write orders
   - Read/write customers
   - Read/write inventory
3. Copy API key, password, and webhook secret

### SparkLayer
1. Sign up for SparkLayer Pro/Enterprise
2. Get your Site ID and API credentials from dashboard
3. Configure your B2B price lists and customer groups

### AutoDS
1. Create AutoDS account
2. Get API key and secret from settings
3. Set up your suppliers and import products

### Syncee
1. Create Syncee account
2. Get API credentials
3. Set up your product feeds

### AfterShip
1. Create AfterShip account
2. Get API key from settings
3. Configure webhook endpoints

## Step 2: Database Setup

### Install PostgreSQL
```bash
# macOS
brew install postgresql
brew services start postgresql

# Ubuntu
sudo apt-get install postgresql
sudo systemctl start postgresql

# Windows
# Download from postgresql.org and run installer
```

### Create Database
```bash
# Create database user (optional)
createuser b2b_autoshipper -P

# Create database
createdb b2b_autoshipper -O b2b_autoshipper
```

### Initialize Schema
```bash
# Using the initialization script
npm run init-db

# Or manually with psql
psql -d b2b_autoshipper -f src/db/schema.sql
```

## Step 3: Redis Setup

### Install Redis
```bash
# macOS
brew install redis
brew services start redis

# Ubuntu
sudo apt-get install redis-server
sudo systemctl start redis

# Windows
# Use WSL or Docker
```

### Test Redis Connection
```bash
redis-cli ping
# Should return: PONG
```

## Step 4: Application Setup

### Clone and Install
```bash
git clone <repository-url>
cd B2B_autoshipper
npm install
```

### Configure Environment Variables
```bash
cp .env.example .env
```

Edit `.env` with your actual values:

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=b2b_autoshipper
DB_USER=b2b_autoshipper
DB_PASSWORD=your_secure_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Shopify
SHOPIFY_SHOP_URL=your-shop.myshopify.com
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_WEBHOOK_SECRET=your_webhook_secret

# SparkLayer
SPARKLAYER_SITE_ID=your_site_id
SPARKLAYER_API_KEY=your_api_key
SPARKLAYER_API_SECRET=your_api_secret

# AutoDS
AUTODS_API_KEY=your_api_key
AUTODS_API_SECRET=your_api_secret

# Syncee
SYNCEE_API_KEY=your_api_key
SYNCEE_API_SECRET=your_api_secret

# AfterShip
AFTERSHIP_API_KEY=your_api_key

# Monitoring (Optional)
SENTRY_DSN=
SLACK_WEBHOOK_URL=
```

## Step 5: Webhook Configuration

### Shopify Webhooks

In Shopify Admin → Settings → Notifications → Webhooks, add:

1. **Order Creation**
   - Event: `orders/create`
   - URL: `https://your-domain.com/webhooks/shopify/orders/create`
   - Format: JSON

2. **Order Update**
   - Event: `orders/updated`
   - URL: `https://your-domain.com/webhooks/shopify/orders/updated`
   - Format: JSON

3. **Customer Creation**
   - Event: `customers/create`
   - URL: `https://your-domain.com/webhooks/shopify/customers/create`
   - Format: JSON

4. **Customer Update**
   - Event: `customers/update`
   - URL: `https://your-domain.com/webhooks/shopify/customers/update`
   - Format: JSON

5. **Product Update**
   - Event: `products/update`
   - URL: `https://your-domain.com/webhooks/shopify/products/update`
   - Format: JSON

### AfterShip Webhooks

In AfterShip dashboard → Notifications → Webhooks:

1. **Tracking Updates**
   - Event: `tracking_update`
   - URL: `https://your-domain.com/webhooks/aftership/tracking`
   - Format: JSON

## Step 6: Initial Data Setup

### Add Suppliers
```sql
INSERT INTO suppliers (name, priority, api_key, is_active) VALUES
('AutoDS', 1, 'your_autods_key', true),
('Wholesale2B', 2, 'your_wholesale2b_key', true),
('Duoplane', 3, 'your_duoplane_key', true);
```

### Test Database Connection
```bash
npm run test-db
```

## Step 7: Start the Application

### Development Mode
```bash
npm run dev
```

The server will start on `http://localhost:3000`

### Production Mode
```bash
npm run build
npm start
```

## Step 8: Verify Setup

### Check Health Endpoint
```bash
curl http://localhost:3000/webhooks/health
```

### Access Bull Board Dashboard
```
http://localhost:3000/admin/queues
```

### Test Webhooks (Development Only)
```bash
# Test Shopify order webhook
curl -X POST http://localhost:3000/webhooks/test/shopify/order \
  -H "Content-Type: application/json" \
  -d '{
    "id": "123456789",
    "email": "test@example.com",
    "tags": "B2B",
    "customer": {
      "id": "987654321",
      "email": "test@example.com",
      "company": "Test Company"
    },
    "line_items": [
      {
        "product_id": "111111",
        "variant_id": "222222",
        "quantity": 1,
        "price": "99.99"
      }
    ],
    "shipping_address": {
      "first_name": "John",
      "last_name": "Doe",
      "address1": "123 Main St",
      "city": "New York",
      "province": "NY",
      "country": "US",
      "zip": "10001"
    }
  }'
```

## Step 9: Monitor and Troubleshoot

### Check Logs
```bash
# Development logs appear in console
# Production logs in logs/ directory
tail -f logs/combined.log
tail -f logs/error.log
```

### Check Queue Status
Visit `http://localhost:3000/admin/queues` to see:
- Active jobs
- Failed jobs
- Queue statistics

### Common Issues

**Database connection fails**
```bash
# Check PostgreSQL is running
pg_isready

# Check connection string in .env
# Ensure database exists
psql -l
```

**Redis connection fails**
```bash
# Check Redis is running
redis-cli ping

# Check connection string in .env
```

**Webhooks not triggering**
```bash
# Check webhook URLs are publicly accessible
# Verify webhook secrets match
# Check server logs for webhook errors
```

## Step 10: Production Deployment

### Using PM2
```bash
npm install -g pm2

# Build the project
npm run build

# Start with PM2
pm2 start dist/server.js --name b2b-autoshipper

# Setup auto-restart on system boot
pm2 startup
pm2 save
```

### Using Docker (Optional)
```bash
docker build -t b2b-autoshipper .
docker run -d -p 3000:3000 --env-file .env b2b-autoshipper
```

### Using Vercel/Render
1. Push code to GitHub
2. Import project in Vercel/Render
3. Configure environment variables in dashboard
4. Deploy

## Next Steps

1. **Configure Routing Rules**: Edit `src/services/routingEngine.ts` to customize supplier selection logic
2. **Set Up Monitoring**: Configure Slack webhooks for alerts
3. **Test End-to-End**: Process a test order through the complete flow
4. **Scale Resources**: Adjust worker concurrency and database connections based on volume
5. **Set Up Backups**: Configure regular database backups

## Support

For issues:
- Check logs in `logs/` directory
- Review Bull Board dashboard
- Enable debug logging by setting `NODE_ENV=development`
- Check API credentials are correct

---

Your B2B AutoShipper is now ready to automate your wholesale operations! 🚀