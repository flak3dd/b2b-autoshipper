# Supabase Setup Guide

This guide explains how to configure the B2B AutoShipper system to use Supabase as your database backend.

## Why Use Supabase?

Supabase provides several advantages over standard PostgreSQL:
- **Managed Database**: No server maintenance required
- **Real-time Subscriptions**: Built-in real-time data synchronization
- **Authentication**: Ready-to-use auth system
- **Storage**: File storage capabilities
- **Edge Functions**: Serverless functions at the edge
- **Dashboard**: Beautiful web interface for database management
- **Free Tier**: Generous free tier for development

## Prerequisites

- A Supabase account (free at supabase.com)
- Basic understanding of database concepts

## Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up
2. Click "New Project"
3. Fill in project details:
   - **Name**: `b2b-autoshipper` (or your preferred name)
   - **Database Password**: Generate a strong password (save this!)
   - **Region**: Choose a region close to your users
4. Click "Create new project"
5. Wait for the project to be provisioned (2-3 minutes)

## Step 2: Get Connection Details

1. Go to your project dashboard
2. Navigate to **Settings** → **Database**
3. Copy the **Connection String** (URI format)
4. Navigate to **Settings** → **API**
5. Copy the **Project URL** and **anon/public key**

## Step 3: Set Up Database Schema

### Option A: Using Supabase Dashboard (Recommended)

1. Go to **SQL Editor** in your Supabase dashboard
2. Click "New Query"
3. Copy the contents of `supabase/migrations/001_initial_schema.sql`
4. Paste into the SQL editor
5. Click "Run" to execute the schema creation
6. Verify tables were created in **Table Editor**

### Option B: Using Migration Files (CLI)

If you prefer using the Supabase CLI:

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Apply migrations
supabase db push
```

## Step 4: Configure Environment Variables

Update your `.env` file:

```env
# Enable Supabase
USE_SUPABASE=true

# Supabase Connection
DATABASE_CONNECTION_STRING=postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres
SUPABASE_URL=https://[YOUR-PROJECT-REF].supabase.co
SUPABASE_KEY=your_supabase_anon_key

# Keep other variables the same...
```

**Important**: Replace the placeholders with your actual Supabase credentials:
- `[YOUR-PASSWORD]`: The database password you created in Step 1
- `[YOUR-PROJECT-REF]`: Your project reference (found in project URL)
- `your_supabase_anon_key`: The anon/public key from API settings

## Step 5: Configure Row Level Security (RLS)

The default schema includes permissive RLS policies for development. For production:

1. Go to **Authentication** → **Policies** in Supabase dashboard
2. Review the default policies
3. Create stricter policies based on your security requirements
4. Consider using Supabase Auth for user management

### Example Production Policies

```sql
-- Only allow authenticated service role to modify suppliers
CREATE POLICY "Service role can manage suppliers" ON suppliers
  FOR ALL USING (auth.role() = 'service_role');

-- Allow read access to authenticated users
CREATE POLICY "Authenticated users can read products" ON products
  FOR SELECT USING (auth.role() = 'authenticated');
```

## Step 6: Test the Connection

```bash
# Test database connection
npm run test-db
```

You should see: `Database connection successful`

## Step 7: Enable Real-time Subscriptions (Optional)

To enable real-time features:

1. Go to **Database** → **Replication** in Supabase dashboard
2. Enable replication for tables you want real-time updates on:
   - `products`
   - `order_mappings`
   - `sync_logs`
3. Uncomment the notification triggers in the migration file

## Step 8: Set Up Backups

Supabase automatically handles backups, but you can configure additional:

1. Go to **Settings** → **Database** → **Backups**
2. Configure backup schedule (daily recommended)
3. Enable point-in-time recovery if needed

## Migration from Standard PostgreSQL

If you're migrating from an existing PostgreSQL database:

1. **Export your data**:
```bash
pg_dump -h localhost -U postgres b2b_autoshipper > backup.sql
```

2. **Import to Supabase**:
```bash
psql -h db.[YOUR-PROJECT-REF].supabase.co -U postgres -d postgres < backup.sql
```

3. **Update environment variables** to use Supabase connection string

## Monitoring and Debugging

### Supabase Dashboard

- **Table Editor**: View and edit data
- **SQL Editor**: Run queries directly
- **Logs**: View database logs and errors
- **Metrics**: Monitor performance metrics

### Query Performance

1. Go to **Database** → **Logs** in Supabase dashboard
2. Monitor slow queries
3. Add indexes if needed (already included in schema)

### Connection Pooling

Supabase provides connection pooling automatically. The connection pool in your app (`max: 20`) works well with Supabase's connection pooler.

## Troubleshooting

### Connection Issues

**Problem**: "Connection refused" or timeout
- **Solution**: Check your Supabase project is active
- **Solution**: Verify connection string format
- **Solution**: Check network/firewall settings

### Authentication Issues

**Problem**: "Permission denied" errors
- **Solution**: Review RLS policies in Supabase dashboard
- **Solution**: Ensure service role key is used for admin operations
- **Solution**: Check user authentication status

### Performance Issues

**Problem**: Slow queries
- **Solution**: Use Supabase's query performance insights
- **Solution**: Add missing indexes
- **Solution**: Enable query caching

## Advanced Features

### Supabase Auth Integration

You can integrate Supabase Auth for user management:

```typescript
import { getSupabase } from './db/connection';

const supabase = getSupabase();

// Sign up a user
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password',
});

// Sign in a user
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password',
});
```

### Real-time Subscriptions

Listen to database changes in real-time:

```typescript
const supabase = getSupabase();

// Subscribe to order changes
const subscription = supabase
  .channel('order_changes')
  .on('postgres_changes', 
    { event: '*', schema: 'public', table: 'order_mappings' },
    (payload) => {
      console.log('Order changed:', payload);
    }
  )
  .subscribe();
```

### Storage Integration

Use Supabase Storage for file uploads:

```typescript
// Upload product images
const { data, error } = await supabase.storage
  .from('product-images')
  .upload('path/to/image.jpg', file);
```

## Best Practices

1. **Environment Variables**: Never commit Supabase credentials to git
2. **RLS Policies**: Always use Row Level Security in production
3. **Connection Pooling**: Reuse database connections
4. **Error Handling**: Implement proper error handling for database operations
5. **Backups**: Regular backup schedule
6. **Monitoring**: Use Supabase's built-in monitoring tools
7. **Indexing**: Add indexes for frequently queried columns
8. **Testing**: Test database operations in development first

## Cost Considerations

Supabase offers a generous free tier:
- **500 MB database storage**
- **1 GB bandwidth**
- **2 API requests per second**
- **500 MB file storage**

For production, consider the Pro tier:
- **8 GB database storage** ($25/month)
- **50 GB bandwidth**
- **Higher rate limits**
- **Priority support**

## Support

- **Supabase Documentation**: https://supabase.com/docs
- **Supabase Discord**: https://supabase.com/discord
- **GitHub Issues**: Report issues in the repository

---

Your B2B AutoShipper is now configured to use Supabase! 🚀