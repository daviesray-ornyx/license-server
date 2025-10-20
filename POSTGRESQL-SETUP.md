# PostgreSQL Setup Guide

The license server now uses PostgreSQL instead of SQLite for production-grade, hosted database support.

## 🗄️ Database Options

### Option 1: Supabase (Recommended - Free Tier Available)

**Pros:** Free tier, managed, includes real-time subscriptions, REST API
**Setup:**

1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Go to Project Settings → Database
4. Copy the "Connection string" (URI format)
5. Add to your `.env`:
   ```env
   DATABASE_URL=postgresql://postgres.xxx:your_password@db.xxx.supabase.co:5432/postgres
   ```

### Option 2: Neon (Serverless PostgreSQL)

**Pros:** Serverless, auto-scaling, free tier
**Setup:**

1. Go to [neon.tech](https://neon.tech)
2. Create a new project
3. Copy the connection string
4. Add to your `.env`:
   ```env
   DATABASE_URL=postgresql://user:password@ep-xxx.neon.tech/neondb
   ```

### Option 3: Railway

**Pros:** Easy deployment, includes PostgreSQL add-on
**Setup:**

1. Go to [railway.app](https://railway.app)
2. Create new project → Add PostgreSQL
3. Copy DATABASE_URL from Variables tab
4. Add to your `.env`

### Option 4: Render

**Pros:** Free PostgreSQL instance, easy deployment
**Setup:**

1. Go to [render.com](https://render.com)
2. New → PostgreSQL
3. Copy External Database URL
4. Add to your `.env`

### Option 5: ElephantSQL

**Pros:** Free PostgreSQL hosting, simple setup
**Setup:**

1. Go to [elephantsql.com](https://elephantsql.com)
2. Create free "Tiny Turtle" instance
3. Copy URL from Details page
4. Add to your `.env`

### Option 6: Local PostgreSQL

**Setup:**

**macOS (Homebrew):**
```bash
brew install postgresql@15
brew services start postgresql@15
createdb accessangel_licenses
```

**Ubuntu/Debian:**
```bash
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo -u postgres createdb accessangel_licenses
```

**Windows:**
Download and install from [postgresql.org](https://www.postgresql.org/download/windows/)

**Connection String:**
```env
DATABASE_URL=postgresql://localhost:5432/accessangel_licenses
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd license-server
npm install
```

### 2. Configure Environment

Create `.env` file:

```env
# Server
PORT=3001
NODE_ENV=development

# JWT Secret (CHANGE THIS!)
JWT_SECRET=your-super-secret-jwt-key-here

# Admin Credentials (CHANGE THIS!)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# License Settings
LICENSE_VALIDITY_DAYS=365
GRACE_PERIOD_DAYS=90

# Database - PostgreSQL
# Use your database connection string from one of the options above
DATABASE_URL=postgresql://user:password@host:5432/database

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

### 3. Start Server

The server will automatically:
- Connect to your PostgreSQL database
- Create all required tables
- Set up indexes
- Create the default admin user

```bash
npm start
```

You should see:
```
✅ Database tables initialized
✅ Default admin user created
   Username: admin
   Password: admin123

═══════════════════════════════════════════════════════════
  🔑  AccessAngel License Server
═══════════════════════════════════════════════════════════
  Server running on: http://localhost:3001
  Database: PostgreSQL (Connected)
```

### 4. Access Admin Portal

Navigate to http://localhost:3001 and login!

## 📊 Database Schema

The server automatically creates these tables:

### `licenses`
- Primary license records
- Status: pending, active, revoked
- Device fingerprint binding
- Expiration tracking

### `validation_logs`
- All activation/validation attempts
- Success/failure tracking
- IP and user agent logging

### `admin_users`
- Admin portal accounts
- Password hashing (bcrypt)
- Last login tracking

### `activity_logs`
- Complete audit trail
- All admin actions logged
- License lifecycle tracking

## 🔧 Database Management

### View Tables

```sql
\c accessangel_licenses  -- Connect to database
\dt                      -- List all tables
\d licenses              -- Describe licenses table
```

### Backup Database

**Using pg_dump:**
```bash
pg_dump -h host -U user -d database > backup.sql
```

**Supabase/Neon/Railway:**
Most platforms provide automatic backups in their dashboard

### Restore Database

```bash
psql -h host -U user -d database < backup.sql
```

### Manual SQL Queries

Connect using `psql`:
```bash
psql "postgresql://user:password@host:5432/database"
```

Example queries:
```sql
-- View all licenses
SELECT license_key, kiosk_name, status, activated_at FROM licenses;

-- Count by status
SELECT status, COUNT(*) FROM licenses GROUP BY status;

-- Recent validations
SELECT * FROM validation_logs ORDER BY created_at DESC LIMIT 10;

-- Admin activity
SELECT username, action, resource_type, created_at 
FROM activity_logs 
JOIN admin_users ON activity_logs.user_id = admin_users.id 
ORDER BY created_at DESC 
LIMIT 20;
```

## 🔐 Security Best Practices

### Production Checklist

- ✅ Use SSL connection (`?sslmode=require` in connection string)
- ✅ Change default admin credentials
- ✅ Use strong JWT_SECRET (64+ random characters)
- ✅ Enable connection pooling (already configured)
- ✅ Set up database backups
- ✅ Use environment-specific databases (dev/staging/prod)
- ✅ Restrict database access by IP (if possible)
- ✅ Use read-only replicas for reporting (advanced)

### Connection String Security

**DON'T:**
- ❌ Commit DATABASE_URL to git
- ❌ Share connection strings
- ❌ Use same database for dev/prod

**DO:**
- ✅ Use environment variables
- ✅ Different databases per environment
- ✅ Rotate credentials periodically

## 🐛 Troubleshooting

### "DATABASE_URL is required"

Create `.env` file with valid `DATABASE_URL`

### "Connection timeout"

Check:
- Database is running
- Connection string is correct
- Firewall allows connection
- IP whitelist (if using cloud database)

### "Password authentication failed"

- Verify username/password in connection string
- Check if user exists
- Reset password in database dashboard

### "Too many connections"

- Connection pooling is enabled (max 20)
- Check for connection leaks
- Increase `max` in `database-pg.js` if needed

### Tables not creating

- Check database permissions
- Verify user has CREATE TABLE rights
- Check server logs for detailed error

## 📈 Performance Tips

### Indexes

Already created automatically:
- `license_key` (unique)
- `device_id_hash`
- `status`
- `validation_logs.license_key`
- `validation_logs.created_at`

### Connection Pooling

Configured for optimal performance:
- Max 20 connections
- 30s idle timeout
- 2s connection timeout

### Query Optimization

The database model uses:
- Prepared statements (SQL injection prevention)
- Indexed lookups
- Efficient JOIN queries

## 🔄 Migration from SQLite

If you're migrating from the old SQLite version:

### Export from SQLite

```bash
# Export data
sqlite3 data/licenses.db .dump > sqlite_export.sql
```

### Convert to PostgreSQL

1. Use [pgloader](https://pgloader.io/) or manual conversion
2. Create tables in PostgreSQL (server does this automatically)
3. Import data:

```bash
psql "your_database_url" < converted_data.sql
```

Or use migration script:

```javascript
// migrate.js
const sqlite3 = require('sqlite3');
const { Pool } = require('pg');

// Read from SQLite, write to PostgreSQL
// Implementation depends on your data volume
```

## 📊 Monitoring

### Health Check

```bash
curl http://localhost:3001/api/health
```

### Database Stats

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3001/api/licenses/stats/dashboard
```

### Connection Status

Check logs for:
- ✅ Database tables initialized
- ✅ Connection pool ready
- ❌ Connection errors

## 🌐 Deployment

### Heroku

```bash
heroku create your-license-server
heroku addons:create heroku-postgresql:mini
git push heroku main
```

Heroku automatically sets `DATABASE_URL`

### Docker

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: accessangel_licenses
      POSTGRES_PASSWORD: your_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
  
  license-server:
    build: .
    ports:
      - "3001:3001"
    environment:
      DATABASE_URL: postgresql://postgres:your_password@postgres:5432/accessangel_licenses
    depends_on:
      - postgres

volumes:
  postgres_data:
```

### Railway/Render

1. Connect GitHub repo
2. Add PostgreSQL service
3. Set environment variables
4. Deploy automatically

## 💡 Tips

- Use [pgAdmin](https://www.pgadmin.org/) for GUI management
- Enable query logging in development
- Monitor slow queries
- Set up alerts for connection issues
- Use database connection string format validator

## 🆘 Support

- PostgreSQL docs: [postgresql.org/docs](https://www.postgresql.org/docs/)
- Node.js pg driver: [node-postgres.com](https://node-postgres.com/)
- Connection string format: [postgresql.org/docs/current/libpq-connect.html](https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNSTRING)

---

**Ready to go! Your license server is now enterprise-ready with PostgreSQL! 🚀**

