# AccessAngel License Server

A secure, modern license management system for AccessAngel Kiosk SDK with a sleek admin portal.

## Features

✅ **Secure License Management**
- RSA-signed licenses with device fingerprinting
- AES-256-GCM encryption
- Device-specific binding

✅ **Dual Activation Methods**
- Online activation (instant)
- Offline activation (pre-generated files)

✅ **Modern Admin Portal**
- Clean, accessible UI
- Real-time statistics
- License search and filtering
- Validation history tracking

✅ **RESTful API**
- JWT authentication
- Rate limiting
- CORS support
- Comprehensive endpoints

## Quick Start

### 1. Installation

```bash
cd license-server
npm install
```

### 2. Configuration

Copy the environment template:

```bash
cp env.example .env
```

Edit `.env` and update the following:

```env
PORT=3001
JWT_SECRET=your-super-secret-jwt-key-change-this
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme123
LICENSE_VALIDITY_DAYS=365
GRACE_PERIOD_DAYS=90
```

⚠️ **IMPORTANT**: Change the default credentials in production!

### 3. Start Server

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

The server will start on `http://localhost:3001`

### 4. Access Admin Portal

Navigate to `http://localhost:3001` in your browser and login with your credentials.

## API Endpoints

### Authentication

**POST** `/api/auth/login`
```json
{
  "username": "admin",
  "password": "password"
}
```

**GET** `/api/auth/verify`
- Verify JWT token validity
- Requires: `Authorization: Bearer <token>`

### License Management

**POST** `/api/licenses/generate` (Admin only)
```json
{
  "kioskName": "KFC-London-OxfordSt-Terminal01",
  "country": "UK",
  "location": {
    "restaurant": "KFC London Oxford Street",
    "country": "UK",
    "region": "London"
  },
  "validityDays": 365
}
```

**POST** `/api/licenses/activate` (Public - for kiosks)
```json
{
  "licenseKey": "KFC-KIO-UK-2024-AB12-CD34-EF56-GH78",
  "deviceId": "device-fingerprint-hash"
}
```

**POST** `/api/licenses/validate` (Public - for kiosks)
```json
{
  "licenseKey": "KFC-KIO-UK-2024-AB12-CD34-EF56-GH78",
  "deviceId": "device-fingerprint-hash"
}
```

**POST** `/api/licenses/generate-offline` (Admin only)
```json
{
  "licenseKey": "KFC-KIO-UK-2024-AB12-CD34-EF56-GH78",
  "deviceId": "device-fingerprint-from-kiosk"
}
```

**GET** `/api/licenses/all` (Admin only)
- Get all licenses with optional filters: `?status=active&country=UK`

**GET** `/api/licenses/:licenseKey` (Admin only)
- Get detailed license information with validation logs

**POST** `/api/licenses/:licenseKey/revoke` (Admin only)
```json
{
  "reason": "Device decommissioned"
}
```

**DELETE** `/api/licenses/:licenseKey` (Admin only)
- Permanently delete a license

**GET** `/api/licenses/keys/public` (Public)
- Get RSA public key for signature verification

**GET** `/api/licenses/stats/dashboard` (Admin only)
- Get dashboard statistics

## Database

The server uses SQLite for data storage. The database file is created automatically at:
- `./data/licenses.db` (default)
- Configure path via `DB_PATH` in `.env`

### Tables

- `licenses` - License records
- `validation_logs` - Validation history
- `admin_users` - Admin accounts
- `activity_logs` - Admin activity audit trail

## Security Features

### License Security
- **Device Binding**: Licenses tied to hardware fingerprints
- **Encryption**: AES-256-GCM with device-specific keys
- **Signatures**: RSA digital signatures prevent tampering
- **Grace Period**: 90-day offline operation window

### API Security
- **JWT Authentication**: Secure admin access
- **Rate Limiting**: Prevents brute force attacks
- **CORS**: Configurable origin whitelist
- **Helmet.js**: Security headers
- **Input Validation**: All inputs sanitized

## Admin Portal Features

### Dashboard
- Real-time statistics (active, pending, revoked licenses)
- Quick access to all functions
- Recent activity tracking

### License Management
- Generate new licenses
- View license details
- Search and filter licenses
- Generate offline activation files
- Revoke/delete licenses
- View validation history

### Accessibility
- WCAG 2.1 Level AA compliant
- Keyboard navigation support
- Screen reader friendly
- High contrast support
- Focus indicators

## Deployment

### Production Checklist

1. ✅ Change default admin credentials
2. ✅ Generate strong JWT secret
3. ✅ Configure CORS origins
4. ✅ Set up HTTPS/SSL
5. ✅ Configure firewall rules
6. ✅ Set up database backups
7. ✅ Configure logging
8. ✅ Set `NODE_ENV=production`

### Docker Deployment (Optional)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

```bash
docker build -t accessangel-license-server .
docker run -p 3001:3001 -v $(pwd)/data:/app/data accessangel-license-server
```

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name license.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## Troubleshooting

### Server won't start
- Check if port 3001 is available
- Verify `.env` file exists and is valid
- Check database directory permissions

### Cannot login
- Verify admin credentials in `.env`
- Check JWT_SECRET is set
- Clear browser localStorage

### License activation fails
- Verify device ID format
- Check license not already activated
- Ensure license not expired/revoked
- Check server logs for details

## Development

### Directory Structure

```
license-server/
├── server.js           # Main server file
├── package.json        # Dependencies
├── env.example         # Environment template
├── routes/             # API routes
│   ├── auth.js
│   └── licenses.js
├── models/             # Database models
│   └── database.js
├── middleware/         # Express middleware
│   └── auth.js
├── utils/              # Utility functions
│   └── crypto.js
├── public/             # Admin portal (static)
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── data/               # Database & keys (auto-created)
    ├── licenses.db
    └── keys/
        ├── private.pem
        └── public.pem
```

### Adding New Admin Users

Currently, only one admin user is supported (configured via `.env`). To add more users, you can directly insert into the database:

```javascript
const bcrypt = require('bcryptjs');
const passwordHash = await bcrypt.hash('newpassword', 10);
db.createAdminUser('newadmin', passwordHash, 'admin@example.com');
```

## Support

For issues or questions:
- Check server logs
- Review API documentation
- Contact: support@thriiver.com

## License

MIT License - See LICENSE file for details

---

**Version:** 1.0.0  
**Last Updated:** October 20, 2024  
**Author:** Thriiver Development Team

