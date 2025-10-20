# Production Deployment Checklist

## ✅ Pre-Deployment

### Security

- [ ] Change `ADMIN_USERNAME` from default
- [ ] Change `ADMIN_PASSWORD` to strong password (16+ characters)
- [ ] Generate new `JWT_SECRET` (64+ random characters)
- [ ] Review and restrict `ALLOWED_ORIGINS`
- [ ] Verify `DATABASE_URL` uses SSL (`sslmode=require`)
- [ ] Review database user permissions (least privilege)
- [ ] Enable database backups
- [ ] Set up database connection pooling limits

### Environment Variables

```env
NODE_ENV=production
PORT=3001
JWT_SECRET=<generate-new-64-char-random-string>
ADMIN_USERNAME=<your-admin-username>
ADMIN_PASSWORD=<your-strong-password>
LICENSE_VALIDITY_DAYS=365
GRACE_PERIOD_DAYS=90
DATABASE_URL=<your-postgresql-connection-string>
ALLOWED_ORIGINS=https://yourdomain.com,https://admin.yourdomain.com
```

### Testing

- [ ] Test login with new credentials
- [ ] Generate test license
- [ ] Test license activation
- [ ] Test license validation
- [ ] Test license revocation
- [ ] Test offline license generation
- [ ] Verify all API endpoints
- [ ] Test rate limiting
- [ ] Test CORS restrictions
- [ ] Load test (optional)

## 🚀 Deployment Options

### Option 1: Deploy to Heroku

```bash
# Install Heroku CLI
brew tap heroku/brew && brew install heroku

# Login
heroku login

# Create app
heroku create your-license-server

# Add PostgreSQL (if not using external)
heroku addons:create heroku-postgresql:mini

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=your-secret-here
heroku config:set ADMIN_USERNAME=admin
heroku config:set ADMIN_PASSWORD=your-password
heroku config:set LICENSE_VALIDITY_DAYS=365
heroku config:set GRACE_PERIOD_DAYS=90
# DATABASE_URL is set automatically by Heroku PostgreSQL

# Deploy
git push heroku main

# Open
heroku open
```

### Option 2: Deploy to Railway

1. Go to [railway.app](https://railway.app)
2. New Project → Deploy from GitHub
3. Select your repository
4. Add PostgreSQL service
5. Set environment variables in Variables tab
6. Deploy automatically triggers

### Option 3: Deploy to Render

1. Go to [render.com](https://render.com)
2. New → Web Service
3. Connect GitHub repository
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Add PostgreSQL database
7. Set environment variables
8. Deploy

### Option 4: Deploy to DigitalOcean App Platform

```bash
# Install doctl
brew install doctl

# Authenticate
doctl auth init

# Create app
doctl apps create --spec app-spec.yaml
```

**app-spec.yaml:**

```yaml
name: license-server
services:
  - name: api
    github:
      repo: your-username/your-repo
      branch: main
      deploy_on_push: true
    build_command: npm install
    run_command: npm start
    environment_slug: node-js
    envs:
      - key: NODE_ENV
        value: production
      - key: JWT_SECRET
        value: ${JWT_SECRET}
        type: SECRET
      - key: ADMIN_USERNAME
        value: admin
      - key: ADMIN_PASSWORD
        value: ${ADMIN_PASSWORD}
        type: SECRET
      - key: DATABASE_URL
        value: ${db.DATABASE_URL}
```

### Option 5: VPS (Ubuntu/Debian)

```bash
# SSH to server
ssh user@your-server-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone repository
git clone https://github.com/your-username/your-repo.git
cd your-repo/license-server

# Install dependencies
npm install --production

# Set environment variables
cp env.example .env
nano .env  # Edit with your values

# Install PM2 (process manager)
sudo npm install -g pm2

# Start server
pm2 start server.js --name license-server

# Save PM2 configuration
pm2 save

# Set PM2 to start on boot
pm2 startup
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME

# View logs
pm2 logs license-server

# Restart
pm2 restart license-server
```

## 🔒 HTTPS/SSL Setup

### Option 1: Use Platform SSL (Recommended)

Most platforms (Heroku, Railway, Render) provide free SSL automatically.

### Option 2: Nginx Reverse Proxy + Let's Encrypt

```bash
# Install Nginx
sudo apt install nginx

# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com

# Configure Nginx
sudo nano /etc/nginx/sites-available/license-server
```

**Nginx config:**

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/license-server /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx

# Auto-renew SSL
sudo certbot renew --dry-run
```

## 📊 Monitoring

### Health Check

Set up monitoring for: `https://yourdomain.com/api/health`

Expected response:

```json
{
  "status": "ok",
  "timestamp": "2024-10-20T00:00:00.000Z",
  "version": "1.0.0"
}
```

### Uptime Monitoring Services

- [UptimeRobot](https://uptimerobot.com) (Free)
- [Pingdom](https://www.pingdom.com)
- [StatusCake](https://www.statuscake.com)
- [Better Uptime](https://betteruptime.com)

### Application Monitoring

- [Sentry](https://sentry.io) - Error tracking
- [LogRocket](https://logrocket.com) - Session replay
- [Datadog](https://www.datadoghq.com) - Full stack monitoring

## 🗄️ Database Maintenance

### Backups

```bash
# Manual backup
pg_dump -h host -U user -d database > backup_$(date +%Y%m%d).sql

# Restore
psql -h host -U user -d database < backup_20241020.sql
```

### Automated Backups

Most hosted PostgreSQL services provide automatic backups:

- **DigitalOcean:** Daily backups (7 days retention)
- **Heroku:** Continuous protection (backups every 24h)
- **Render:** Daily backups
- **Supabase:** Point-in-time recovery

### Database Optimization

```sql
-- Vacuum (clean up)
VACUUM ANALYZE;

-- Reindex
REINDEX DATABASE kiosk_prod;

-- Check table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

## 🔐 Security Hardening

### Firewall (UFW on Ubuntu)

```bash
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw enable
```

### Fail2Ban (Brute force protection)

```bash
sudo apt install fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### Keep Dependencies Updated

```bash
npm audit
npm audit fix
npm update
```

## 📈 Performance Optimization

### Enable Compression

Already enabled via Helmet.js in production mode.

### Database Connection Pooling

Already configured with:

- Max connections: 20
- Idle timeout: 30s
- Connection timeout: 2s

### Caching (Optional)

Consider adding Redis for:

- Session storage
- Rate limiting
- API response caching

## 🧪 Post-Deployment Testing

```bash
# Test endpoints
./test-production.sh yourdomain.com

# Or manually:
curl https://yourdomain.com/api/health
curl -X POST https://yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}'
```

## 📞 Support & Troubleshooting

### Common Issues

**Can't connect to database:**

- Check `DATABASE_URL` is correct
- Verify SSL mode is set (`sslmode=require`)
- Check database firewall/IP whitelist
- Verify database is running

**Admin login fails:**

- Run `node reset-admin.js` to reset credentials
- Check `.env` file exists and is loaded
- Verify `JWT_SECRET` is set

**Rate limit errors:**

- Check if you're being rate limited (429 status)
- Wait 15 minutes or adjust limits in code

**Port already in use:**

- Change `PORT` in `.env`
- Or kill process: `lsof -ti:3001 | xargs kill`

## ✅ Final Checklist

- [ ] Server deployed and accessible
- [ ] HTTPS enabled
- [ ] Database connected
- [ ] Admin credentials changed
- [ ] All tests passing
- [ ] Monitoring set up
- [ ] Backups configured
- [ ] Documentation updated
- [ ] Team notified of new URL and credentials
- [ ] Old SQLite version (if any) deprecated

## 🎉 You're Done!

Your license server is now production-ready and secure!

**Next:** Integrate the SDK with kiosks and start licensing!

---

**Need Help?**

- Check logs: `pm2 logs` or platform-specific logs
- Review documentation: README.md
- Check database: Connect with psql or pgAdmin
