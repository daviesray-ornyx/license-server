# Quick Start Guide - AccessAngel License Server

## 🎉 Server is Running!

Your license server is now accessible at: **http://localhost:3001**

## 🔐 Default Credentials

```
Username: admin
Password: admin123
```

⚠️ **Change these in production!**

## 🚀 What's Running

### License Server
- **URL:** http://localhost:3001
- **API Base:** http://localhost:3001/api
- **Health Check:** http://localhost:3001/api/health

### Admin Portal
- **URL:** http://localhost:3001
- Modern, accessible web interface
- Real-time license management
- Statistics dashboard

## 📋 Quick Test

### 1. Login to Admin Portal

Navigate to http://localhost:3001 and login with the credentials above.

### 2. Generate Your First License

Click "Generate New License" and fill in:
- **Kiosk Name:** KFC-Test-Terminal01
- **Restaurant:** KFC Test Location
- **Country:** UK
- **Region:** London
- **Validity:** 365 days

Click "Generate License" - you'll get a license key like: `KFC-KIO-UK-2024-XXXX-XXXX-XXXX-XXXX`

### 3. Test API Endpoints

**Health Check:**
```bash
curl http://localhost:3001/api/health
```

**Login (Get Token):**
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

Save the token from the response, then:

**Generate License:**
```bash
curl -X POST http://localhost:3001/api/licenses/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "kioskName": "KFC-London-Test-01",
    "country": "UK",
    "location": {
      "restaurant": "KFC London Test",
      "country": "UK",
      "region": "London"
    },
    "validityDays": 365
  }'
```

**Activate License (Simulate Kiosk):**
```bash
curl -X POST http://localhost:3001/api/licenses/activate \
  -H "Content-Type: application/json" \
  -d '{
    "licenseKey": "YOUR_LICENSE_KEY_HERE",
    "deviceId": "test-device-12345"
  }'
```

## 📁 Files Created

```
license-server/
├── data/
│   ├── licenses.db          ✅ SQLite database
│   └── keys/
│       ├── private.pem      ✅ RSA private key
│       └── public.pem       ✅ RSA public key
└── .env                     ✅ Configuration
```

## 🎨 Admin Portal Features

### Dashboard
- ✅ Real-time statistics
- ✅ Active/Pending/Revoked counts
- ✅ Recent activity

### License Management
- ✅ Generate new licenses
- ✅ View all licenses
- ✅ Search & filter
- ✅ View detailed info
- ✅ Revoke licenses
- ✅ Generate offline files

### Accessibility
- ✅ WCAG 2.1 Level AA compliant
- ✅ Keyboard navigation
- ✅ Screen reader support
- ✅ High contrast mode

## 🔧 Common Commands

**Start server:**
```bash
npm start
```

**Development mode (auto-reload):**
```bash
npm run dev
```

**Stop server:**
```bash
# Find process
lsof -i :3001

# Kill it
kill -9 <PID>
```

**View logs:**
```bash
# Server logs are printed to console
# In production, redirect to file:
npm start > server.log 2>&1 &
```

**Backup database:**
```bash
cp data/licenses.db data/licenses.db.backup
```

## 🐛 Troubleshooting

### Port already in use
```bash
# Kill existing process
lsof -ti:3001 | xargs kill -9

# Or change port in .env
PORT=3002
```

### Can't login
- Check `.env` file exists
- Verify ADMIN_USERNAME and ADMIN_PASSWORD
- Clear browser localStorage: `localStorage.clear()`

### Database errors
```bash
# Reset database (CAUTION: deletes all data)
rm -rf data/licenses.db
npm start  # Will create new database
```

## 📖 Next Steps

1. ✅ Server is running
2. ✅ Admin portal accessible
3. ⏳ Integrate SDK with kiosks
4. ⏳ Test complete flow
5. ⏳ Deploy to production

## 🔗 API Documentation

Full API documentation available at: http://localhost:3001/api/docs (coming soon)

Or see README.md for complete API reference.

## 💡 Tips

### Security
- Change default credentials immediately
- Use strong JWT_SECRET in production
- Enable HTTPS for production
- Restrict CORS origins

### Performance
- SQLite is perfect for < 10,000 licenses
- For larger deployments, consider PostgreSQL
- Database is automatically backed up via WAL mode

### Monitoring
- Check `/api/health` for uptime monitoring
- Use `/api/licenses/stats/dashboard` for metrics
- Activity logs track all admin actions

## 🎯 Ready for SDK Integration

The server is ready! Next, we'll integrate the licensing logic into the SDK kit so kiosks can:
1. Generate device fingerprints
2. Activate licenses (online/offline)
3. Validate periodically
4. Handle grace periods

---

**Need Help?**
- Check README.md for detailed documentation
- Review server logs for errors
- Contact: support@thriiver.com

**Enjoy your secure license server! 🚀**


