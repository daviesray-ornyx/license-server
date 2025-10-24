const { Pool } = require('pg');

class LicenseDatabase {
    constructor(connectionString) {
        // Parse connection string to remove sslmode and handle it separately
        const cleanConnectionString = connectionString.replace(/[?&]sslmode=require/g, '');
        const requireSSL = connectionString.includes('sslmode=require') ||
            connectionString.includes('ssl=true') ||
            process.env.NODE_ENV === 'production';

        this.pool = new Pool({
            connectionString: cleanConnectionString,
            ssl: requireSSL ? { rejectUnauthorized: false } : false,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000, // Increased from 2000 to 10000ms
        });

        // Test connection
        this.pool.on('error', (err) => {
            console.error('Unexpected database error:', err);
        });
    }

    async initialize() {
        await this.initializeTables();
    }

    async initializeTables() {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Licenses table
            await client.query(`
        CREATE TABLE IF NOT EXISTS licenses (
          id SERIAL PRIMARY KEY,
          license_key TEXT UNIQUE NOT NULL,
          device_id_hash TEXT,
          kiosk_name TEXT NOT NULL,
          location_restaurant TEXT,
          location_country TEXT,
          location_region TEXT,
          status TEXT DEFAULT 'pending',
          issued_at TIMESTAMP NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          activated_at TIMESTAMP,
          last_validated_at TIMESTAMP,
          revoked_at TIMESTAMP,
          revoke_reason TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_license_key ON licenses(license_key);
        CREATE INDEX IF NOT EXISTS idx_device_id_hash ON licenses(device_id_hash);
        CREATE INDEX IF NOT EXISTS idx_status ON licenses(status);
      `);

            // Validation logs table
            await client.query(`
        CREATE TABLE IF NOT EXISTS validation_logs (
          id SERIAL PRIMARY KEY,
          license_key TEXT NOT NULL,
          device_id_hash TEXT NOT NULL,
          validation_type TEXT NOT NULL,
          success BOOLEAN NOT NULL,
          error_message TEXT,
          ip_address TEXT,
          user_agent TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_validation_license ON validation_logs(license_key);
        CREATE INDEX IF NOT EXISTS idx_validation_created ON validation_logs(created_at);
      `);

            // Admin users table
            await client.query(`
        CREATE TABLE IF NOT EXISTS admin_users (
          id SERIAL PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          email TEXT,
          role TEXT DEFAULT 'admin',
          last_login_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

            // Activity logs table
            await client.query(`
        CREATE TABLE IF NOT EXISTS activity_logs (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES admin_users(id),
          action TEXT NOT NULL,
          resource_type TEXT,
          resource_id TEXT,
          details TEXT,
          ip_address TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at);
      `);

            await client.query('COMMIT');
            console.log('✅ Database tables initialized');
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error initializing database:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // License operations
    async createLicense(licenseData) {
        const query = `
      INSERT INTO licenses (
        license_key, kiosk_name, location_restaurant, location_country, 
        location_region, status, issued_at, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

        const values = [
            licenseData.licenseKey,
            licenseData.kioskName,
            licenseData.location?.restaurant || null,
            licenseData.location?.country || null,
            licenseData.location?.region || null,
            'pending',
            licenseData.issuedAt,
            licenseData.expiresAt
        ];

        const result = await this.pool.query(query, values);
        return result.rows[0];
    }

    async getLicenseByKey(licenseKey) {
        const query = 'SELECT * FROM licenses WHERE license_key = $1';
        const result = await this.pool.query(query, [licenseKey]);
        return result.rows[0];
    }

    async getLicenseByDeviceId(deviceIdHash) {
        const query = 'SELECT * FROM licenses WHERE device_id_hash = $1 AND status = $2';
        const result = await this.pool.query(query, [deviceIdHash, 'active']);
        return result.rows[0];
    }

    async getAllLicenses(filters = {}) {
        let query = 'SELECT * FROM licenses WHERE 1=1';
        const values = [];
        let paramCount = 1;

        if (filters.status) {
            query += ` AND status = $${paramCount}`;
            values.push(filters.status);
            paramCount++;
        }

        if (filters.country) {
            query += ` AND location_country = $${paramCount}`;
            values.push(filters.country);
            paramCount++;
        }

        query += ' ORDER BY created_at DESC';

        if (filters.limit) {
            query += ` LIMIT $${paramCount}`;
            values.push(filters.limit);
        }

        const result = await this.pool.query(query, values);
        return result.rows;
    }

    async activateLicense(licenseKey, deviceIdHash) {
        const query = `
      UPDATE licenses 
      SET device_id_hash = $1, status = 'active', activated_at = $2, 
          last_validated_at = $3, updated_at = $4
      WHERE license_key = $5
      RETURNING *
    `;

        const now = new Date().toISOString();
        const result = await this.pool.query(query, [deviceIdHash, now, now, now, licenseKey]);
        return result.rows[0];
    }

    async updateValidation(licenseKey) {
        const query = `
      UPDATE licenses 
      SET last_validated_at = $1, updated_at = $2
      WHERE license_key = $3
      RETURNING *
    `;

        const now = new Date().toISOString();
        const result = await this.pool.query(query, [now, now, licenseKey]);
        return result.rows[0];
    }

    async revokeLicense(licenseKey, reason) {
        const query = `
      UPDATE licenses 
      SET status = 'revoked', revoked_at = $1, revoke_reason = $2, updated_at = $3
      WHERE license_key = $4
      RETURNING *
    `;

        const now = new Date().toISOString();
        const result = await this.pool.query(query, [now, reason, now, licenseKey]);
        return result.rows[0];
    }

    async deleteLicense(licenseKey) {
        const query = 'DELETE FROM licenses WHERE license_key = $1';
        const result = await this.pool.query(query, [licenseKey]);
        return result.rowCount;
    }

    // Validation logs
    async logValidation(logData) {
        const query = `
      INSERT INTO validation_logs (
        license_key, device_id_hash, validation_type, success, 
        error_message, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

        const values = [
            logData.licenseKey,
            logData.deviceIdHash,
            logData.validationType,
            logData.success,
            logData.errorMessage || null,
            logData.ipAddress || null,
            logData.userAgent || null
        ];

        const result = await this.pool.query(query, values);
        return result.rows[0];
    }

    async getValidationLogs(licenseKey, limit = 50) {
        const query = `
      SELECT * FROM validation_logs 
      WHERE license_key = $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `;
        const result = await this.pool.query(query, [licenseKey, limit]);
        return result.rows;
    }

    // Admin users
    async createAdminUser(username, passwordHash, email = null) {
        const query = `
      INSERT INTO admin_users (username, password_hash, email)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
        const result = await this.pool.query(query, [username, passwordHash, email]);
        return result.rows[0];
    }

    async getAdminUser(username) {
        const query = 'SELECT * FROM admin_users WHERE username = $1';
        const result = await this.pool.query(query, [username]);
        return result.rows[0];
    }

    async updateAdminLastLogin(userId) {
        const query = `
      UPDATE admin_users 
      SET last_login_at = $1 
      WHERE id = $2
      RETURNING *
    `;
        const result = await this.pool.query(query, [new Date().toISOString(), userId]);
        return result.rows[0];
    }

    // Activity logs
    async logActivity(activityData) {
        const query = `
      INSERT INTO activity_logs (
        user_id, action, resource_type, resource_id, details, ip_address
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

        const values = [
            activityData.userId || null,
            activityData.action,
            activityData.resourceType || null,
            activityData.resourceId || null,
            activityData.details || null,
            activityData.ipAddress || null
        ];

        const result = await this.pool.query(query, values);
        return result.rows[0];
    }

    async getActivityLogs(limit = 100) {
        const query = `
      SELECT al.*, au.username 
      FROM activity_logs al
      LEFT JOIN admin_users au ON al.user_id = au.id
      ORDER BY al.created_at DESC
      LIMIT $1
    `;
        const result = await this.pool.query(query, [limit]);
        return result.rows;
    }

    // Statistics
    async getStats() {
        const stats = {};

        const totalResult = await this.pool.query('SELECT COUNT(*) as count FROM licenses');
        stats.total = parseInt(totalResult.rows[0].count);

        const activeResult = await this.pool.query('SELECT COUNT(*) as count FROM licenses WHERE status = $1', ['active']);
        stats.active = parseInt(activeResult.rows[0].count);

        const pendingResult = await this.pool.query('SELECT COUNT(*) as count FROM licenses WHERE status = $1', ['pending']);
        stats.pending = parseInt(pendingResult.rows[0].count);

        const revokedResult = await this.pool.query('SELECT COUNT(*) as count FROM licenses WHERE status = $1', ['revoked']);
        stats.revoked = parseInt(revokedResult.rows[0].count);

        const expiredResult = await this.pool.query('SELECT COUNT(*) as count FROM licenses WHERE expires_at < $1', [new Date().toISOString()]);
        stats.expired = parseInt(expiredResult.rows[0].count);

        const recentActivationsResult = await this.pool.query(
            "SELECT COUNT(*) as count FROM licenses WHERE activated_at > NOW() - INTERVAL '7 days'"
        );
        stats.recentActivations = parseInt(recentActivationsResult.rows[0].count);

        const recentValidationsResult = await this.pool.query(
            "SELECT COUNT(*) as count FROM validation_logs WHERE created_at > NOW() - INTERVAL '7 days'"
        );
        stats.recentValidations = parseInt(recentValidationsResult.rows[0].count);

        return stats;
    }

    async close() {
        await this.pool.end();
    }
}

module.exports = LicenseDatabase;

