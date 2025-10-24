require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const LicenseDatabase = require('./models/database-pg');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3001;

// Validate DATABASE_URL
if (!process.env.DATABASE_URL) {
    console.error('❌ ERROR: DATABASE_URL environment variable is required');
    console.error('   Please set it in your .env file');
    console.error('   Example: DATABASE_URL=postgresql://user:password@host:5432/database');
    process.exit(1);
}

// Initialize database
const db = new LicenseDatabase(process.env.DATABASE_URL);

// Initialize database and create default admin user
async function initializeServer() {
    try {
        // Initialize database tables
        await db.initialize();

        // Create default admin user if none exists
        const adminUser = await db.getAdminUser(process.env.ADMIN_USERNAME || 'admin');

        if (!adminUser) {
            const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'changeme123', 10);
            await db.createAdminUser(
                process.env.ADMIN_USERNAME || 'admin',
                passwordHash,
                null
            );
            console.log('✅ Default admin user created');
            console.log(`   Username: ${process.env.ADMIN_USERNAME || 'admin'}`);
            console.log(`   Password: ${process.env.ADMIN_PASSWORD || 'changeme123'}`);
            console.log('   ⚠️  Please change these credentials in production!');
        } else {
            console.log('✅ Admin user already exists');
            console.log(`   Username: ${adminUser.username}`);
        }
    } catch (error) {
        console.error('❌ Error initializing server:', error);
        process.exit(1);
    }
}

initializeServer();

// Middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disable for development
    crossOriginEmbedderPolicy: false
}));

app.use(cors({
    origin: true, // Allow all origins for development
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting for API routes
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            error: 'Too many requests',
            message: 'Please try again later.'
        });
    }
});

const authLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // Reduced to 5 minutes
    max: 10, // Increased to 10 attempts per 5 minutes
    message: 'Too many login attempts, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Don't count successful logins
    handler: (req, res) => {
        res.status(429).json({
            error: 'Too many login attempts',
            message: 'Please try again in 5 minutes.'
        });
    }
});

// Static files (admin portal)
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authLimiter, require('./routes/auth')(db));
app.use('/api/licenses', apiLimiter, require('./routes/licenses')(db));

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Development: Rate limit reset endpoint
if (process.env.NODE_ENV !== 'production') {
    app.post('/api/dev/reset-rate-limit', (req, res) => {
        // Clear rate limit stores
        authLimiter.resetKey(req.ip);
        apiLimiter.resetKey(req.ip);

        res.json({
            success: true,
            message: 'Rate limits reset for your IP',
            timestamp: new Date().toISOString()
        });
    });
}

// Serve admin portal for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Start server
app.listen(PORT, () => {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  🔑  AccessAngel License Server');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Server running on: http://localhost:${PORT}`);
    console.log(`  Admin Portal: http://localhost:${PORT}`);
    console.log(`  API Base: http://localhost:${PORT}/api`);
    console.log('');
    console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`  Database: PostgreSQL (${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}}`);
    console.log('');
    console.log('  📋 API Endpoints:');
    console.log('     POST   /api/auth/login');
    console.log('     GET    /api/auth/verify');
    console.log('     POST   /api/licenses/generate');
    console.log('     POST   /api/licenses/activate');
    console.log('     POST   /api/licenses/validate');
    console.log('     GET    /api/licenses/all');
    console.log('     GET    /api/licenses/:key');
    console.log('     POST   /api/licenses/:key/revoke');
    console.log('     DELETE /api/licenses/:key');
    console.log('     GET    /api/licenses/keys/public');
    console.log('     GET    /api/licenses/stats/dashboard');
    console.log('');
    console.log('  Press Ctrl+C to stop');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    db.close();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('\nSIGINT signal received: closing HTTP server');
    db.close();
    process.exit(0);
});

module.exports = app;

