/**
 * Analytics Authentication Routes
 * Handles user authentication for analytics dashboard access
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Secret key for JWT (should be in environment variable)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Helper function to execute queries using the main database connection
async function query(db, text, params) {
    const client = await db.pool.connect();
    try {
        const result = await client.query(text, params);
        return result;
    } finally {
        client.release();
    }
}

/**
 * Register a new analytics user
 * POST /api/analytics-auth/register
 */
router.post('/register', async (req, res) => {
    try {
        const { licenseKey, email, password, fullName, deviceId } = req.body;
        const db = req.app.locals.db; // Get database connection from app locals

        // Validation
        if (!licenseKey || !email || !password || !deviceId) {
            return res.status(400).json({
                success: false,
                error: 'License key, email, password, and device ID are required'
            });
        }

        // Validate license key format
        if (!licenseKey.startsWith('KFC-KIO-UK-2025-')) {
            return res.status(400).json({
                success: false,
                error: 'Invalid license key format. Must start with KFC-KIO-UK-2025-'
            });
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid email format'
            });
        }

        // Password strength validation (min 8 characters)
        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                error: 'Password must be at least 8 characters long'
            });
        }

        // Check if license exists and is active
        const licenseResult = await query(db,
            'SELECT license_key, status, device_id_hash FROM licenses WHERE license_key = $1',
            [licenseKey]
        );

        if (licenseResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'License key not found'
            });
        }

        const license = licenseResult.rows[0];
        if (license.status !== 'active') {
            return res.status(403).json({
                success: false,
                error: 'License is not active'
            });
        }

        // Note: device_id validation is handled by checking if license is active
        // The device_id_hash in the licenses table is used for activation, not for auth validation

        // Check if user already exists
        const existingUser = await query(db,
            'SELECT id FROM analytics_users WHERE license_key = $1 AND email = $2',
            [licenseKey, email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                success: false,
                error: 'User with this email already exists for this license'
            });
        }

        // Hash password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Insert user
        const result = await query(db,
            `INSERT INTO analytics_users (license_key, email, password_hash, full_name)
             VALUES ($1, $2, $3, $4)
             RETURNING id, email, full_name, created_at`,
            [licenseKey, email, passwordHash, fullName || null]
        );

        const user = result.rows[0];

        // Create initial session
        const sessionToken = jwt.sign(
            {
                licenseKey,
                email,
                userId: user.id,
                deviceId: deviceId,
                type: 'analytics'
            },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        // Store session in database
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        await query(db,
            'INSERT INTO analytics_sessions (license_key, email, device_id, session_token, expires_at) VALUES ($1, $2, $3, $4, $5)',
            [licenseKey, email, deviceId, sessionToken, expiresAt]
        );

        console.log(`✅ Analytics user registered: ${email} for license ${licenseKey}`);

        res.json({
            success: true,
            message: 'User registered successfully',
            user: {
                email: user.email,
                fullName: user.full_name,
                createdAt: user.created_at
            },
            session: {
                token: sessionToken,
                expiresAt: expiresAt.toISOString(),
                validatedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('❌ Registration error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to register user',
            details: error.message
        });
    }
});

/**
 * Login (validate email and password)
 * POST /api/analytics-auth/login
 */
router.post('/login', async (req, res) => {
    try {
        const { licenseKey, email, password, deviceId } = req.body;

        // Validation
        if (!licenseKey || !email || !password || !deviceId) {
            return res.status(400).json({
                success: false,
                error: 'License key, email, password, and device ID are required'
            });
        }

        // Validate license key format
        if (!licenseKey.startsWith('KFC-KIO-UK-2025-')) {
            return res.status(400).json({
                success: false,
                error: 'Invalid license key format. Must start with KFC-KIO-UK-2025-'
            });
        }

        // Check if license exists and is active
        const licenseResult = await query(
            'SELECT license_key, status, device_id FROM licenses WHERE license_key = $1',
            [licenseKey]
        );

        if (licenseResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'License key not found'
            });
        }

        const license = licenseResult.rows[0];
        if (license.status !== 'active') {
            return res.status(403).json({
                success: false,
                error: 'License is not active'
            });
        }

        // Validate device ID matches the license
        if (license.device_id && license.device_id !== deviceId) {
            return res.status(403).json({
                success: false,
                error: 'Device ID does not match the license key'
            });
        }

        // Get user from database
        const userResult = await query(
            `SELECT id, email, password_hash, full_name, is_active
             FROM analytics_users
             WHERE license_key = $1 AND email = $2`,
            [licenseKey, email]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        const user = userResult.rows[0];

        // Check if user is active
        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                error: 'User account is disabled'
            });
        }

        // Verify password
        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        // Update last login
        await query(
            'UPDATE analytics_users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
            [user.id]
        );

        // Create new session
        const sessionToken = jwt.sign(
            {
                licenseKey,
                email,
                userId: user.id,
                deviceId: deviceId || null,
                type: 'analytics'
            },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        await query(
            `INSERT INTO analytics_sessions (license_key, email, session_token, device_id, expires_at, ip_address, user_agent)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [licenseKey, email, sessionToken, deviceId || null, expiresAt, req.ip, req.get('user-agent')]
        );

        console.log(`✅ Analytics user logged in: ${email} for license ${licenseKey}`);

        res.json({
            success: true,
            message: 'Login successful',
            user: {
                email: user.email,
                fullName: user.full_name
            },
            session: {
                token: sessionToken,
                expiresAt: expiresAt.toISOString(),
                validatedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed',
            details: error.message
        });
    }
});

/**
 * Validate session token
 * POST /api/analytics-auth/validate
 */
router.post('/validate', async (req, res) => {
    try {
        const { licenseKey, email, token } = req.body;

        if (!licenseKey || !email || !token) {
            return res.status(400).json({
                success: false,
                error: 'License key, email, and token are required'
            });
        }

        // Verify JWT
        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired token',
                needsLogin: true
            });
        }

        // Check session in database
        const sessionResult = await query(
            `SELECT id, expires_at, is_valid
             FROM analytics_sessions
             WHERE license_key = $1 AND email = $2 AND session_token = $3`,
            [licenseKey, email, token]
        );

        if (sessionResult.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Session not found',
                needsLogin: true
            });
        }

        const session = sessionResult.rows[0];

        // Check if session is still valid
        if (!session.is_valid || new Date(session.expires_at) < new Date()) {
            return res.status(401).json({
                success: false,
                error: 'Session expired',
                needsLogin: true
            });
        }

        // Session is valid
        console.log(`✅ Session validated: ${email} for license ${licenseKey}`);

        res.json({
            success: true,
            valid: true,
            expiresAt: session.expires_at,
            user: {
                email: decoded.email
            }
        });

    } catch (error) {
        console.error('❌ Validation error:', error);
        res.status(500).json({
            success: false,
            error: 'Validation failed',
            details: error.message
        });
    }
});

/**
 * Check if license has any analytics users
 * GET /api/analytics-auth/check/:licenseKey
 */
router.get('/check/:licenseKey', async (req, res) => {
    try {
        const { licenseKey } = req.params;

        const result = await query(
            'SELECT COUNT(*) as count FROM analytics_users WHERE license_key = $1 AND is_active = true',
            [licenseKey]
        );

        const hasUsers = parseInt(result.rows[0].count) > 0;

        res.json({
            success: true,
            hasUsers,
            count: parseInt(result.rows[0].count)
        });

    } catch (error) {
        console.error('❌ Check error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check users'
        });
    }
});

/**
 * Logout (invalidate session)
 * POST /api/analytics-auth/logout
 */
router.post('/logout', async (req, res) => {
    try {
        const { licenseKey, email, token } = req.body;

        if (!token) {
            return res.status(400).json({
                success: false,
                error: 'Token is required'
            });
        }

        // Invalidate session
        await query(
            `UPDATE analytics_sessions
             SET is_valid = false
             WHERE session_token = $1`,
            [token]
        );

        console.log(`✅ User logged out: ${email} for license ${licenseKey}`);

        res.json({
            success: true,
            message: 'Logged out successfully'
        });

    } catch (error) {
        console.error('❌ Logout error:', error);
        res.status(500).json({
            success: false,
            error: 'Logout failed'
        });
    }
});

module.exports = router;

