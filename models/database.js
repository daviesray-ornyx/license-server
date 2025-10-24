const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class LicenseDatabase {
    constructor(dbPath = './data/licenses.db') {
        // Ensure data directory exists
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.initializeTables();
    }

    initializeTables() {
        // Licenses table
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS licenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_key TEXT UNIQUE NOT NULL,
        device_id_hash TEXT,
        kiosk_name TEXT NOT NULL,
        location_restaurant TEXT,
        location_country TEXT,
        location_region TEXT,
        status TEXT DEFAULT 'pending',
        issued_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        activated_at TEXT,
        last_validated_at TEXT,
        revoked_at TEXT,
        revoke_reason TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_license_key ON licenses(license_key);
      CREATE INDEX IF NOT EXISTS idx_device_id_hash ON licenses(device_id_hash);
      CREATE INDEX IF NOT EXISTS idx_status ON licenses(status);
    `);

        // Validation logs table
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS validation_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_key TEXT NOT NULL,
        device_id_hash TEXT NOT NULL,
        validation_type TEXT NOT NULL,
        success BOOLEAN NOT NULL,
        error_message TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (license_key) REFERENCES licenses(license_key)
      );
      
      CREATE INDEX IF NOT EXISTS idx_validation_license ON validation_logs(license_key);
      CREATE INDEX IF NOT EXISTS idx_validation_created ON validation_logs(created_at);
    `);

        // Admin users table
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        email TEXT,
        role TEXT DEFAULT 'admin',
        last_login_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

        // Activity logs table
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        resource_type TEXT,
        resource_id TEXT,
        details TEXT,
        ip_address TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES admin_users(id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at);
    `);
    }

    // License operations
    createLicense(licenseData) {
        const stmt = this.db.prepare(`
      INSERT INTO licenses (
        license_key, kiosk_name, location_restaurant, location_country, 
        location_region, status, issued_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

        return stmt.run(
            licenseData.licenseKey,
            licenseData.kioskName,
            licenseData.location?.restaurant || null,
            licenseData.location?.country || null,
            licenseData.location?.region || null,
            'pending',
            licenseData.issuedAt,
            licenseData.expiresAt
        );
    }

    getLicenseByKey(licenseKey) {
        const stmt = this.db.prepare('SELECT * FROM licenses WHERE license_key = ?');
        return stmt.get(licenseKey);
    }

    getLicenseByDeviceId(deviceIdHash) {
        const stmt = this.db.prepare('SELECT * FROM licenses WHERE device_id_hash = ? AND status = ?');
        return stmt.get(deviceIdHash, 'active');
    }

    getAllLicenses(filters = {}) {
        let query = 'SELECT * FROM licenses WHERE 1=1';
        const params = [];

        if (filters.status) {
            query += ' AND status = ?';
            params.push(filters.status);
        }

        if (filters.country) {
            query += ' AND location_country = ?';
            params.push(filters.country);
        }

        query += ' ORDER BY created_at DESC';

        if (filters.limit) {
            query += ' LIMIT ?';
            params.push(filters.limit);
        }

        const stmt = this.db.prepare(query);
        return stmt.all(...params);
    }

    activateLicense(licenseKey, deviceIdHash) {
        const stmt = this.db.prepare(`
      UPDATE licenses 
      SET device_id_hash = ?, status = 'active', activated_at = ?, 
          last_validated_at = ?, updated_at = ?
      WHERE license_key = ?
    `);

        const now = new Date().toISOString();
        return stmt.run(deviceIdHash, now, now, now, licenseKey);
    }

    updateValidation(licenseKey) {
        const stmt = this.db.prepare(`
      UPDATE licenses 
      SET last_validated_at = ?, updated_at = ?
      WHERE license_key = ?
    `);

        const now = new Date().toISOString();
        return stmt.run(now, now, licenseKey);
    }

    revokeLicense(licenseKey, reason) {
        const stmt = this.db.prepare(`
      UPDATE licenses 
      SET status = 'revoked', revoked_at = ?, revoke_reason = ?, updated_at = ?
      WHERE license_key = ?
    `);

        const now = new Date().toISOString();
        return stmt.run(now, reason, now, licenseKey);
    }

    deleteLicense(licenseKey) {
        const stmt = this.db.prepare('DELETE FROM licenses WHERE license_key = ?');
        return stmt.run(licenseKey);
    }

    // Validation logs
    logValidation(logData) {
        const stmt = this.db.prepare(`
      INSERT INTO validation_logs (
        license_key, device_id_hash, validation_type, success, 
        error_message, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

        return stmt.run(
            logData.licenseKey,
            logData.deviceIdHash,
            logData.validationType,
            logData.success ? 1 : 0,
            logData.errorMessage || null,
            logData.ipAddress || null,
            logData.userAgent || null
        );
    }

    getValidationLogs(licenseKey, limit = 50) {
        const stmt = this.db.prepare(`
      SELECT * FROM validation_logs 
      WHERE license_key = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `);
        return stmt.all(licenseKey, limit);
    }

    // Admin users
    createAdminUser(username, passwordHash, email = null) {
        const stmt = this.db.prepare(`
      INSERT INTO admin_users (username, password_hash, email)
      VALUES (?, ?, ?)
    `);
        return stmt.run(username, passwordHash, email);
    }

    getAdminUser(username) {
        const stmt = this.db.prepare('SELECT * FROM admin_users WHERE username = ?');
        return stmt.get(username);
    }

    updateAdminLastLogin(userId) {
        const stmt = this.db.prepare(`
      UPDATE admin_users 
      SET last_login_at = ? 
      WHERE id = ?
    `);
        return stmt.run(new Date().toISOString(), userId);
    }

    // Activity logs
    logActivity(activityData) {
        const stmt = this.db.prepare(`
      INSERT INTO activity_logs (
        user_id, action, resource_type, resource_id, details, ip_address
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

        return stmt.run(
            activityData.userId || null,
            activityData.action,
            activityData.resourceType || null,
            activityData.resourceId || null,
            activityData.details || null,
            activityData.ipAddress || null
        );
    }

    getActivityLogs(limit = 100) {
        const stmt = this.db.prepare(`
      SELECT al.*, au.username 
      FROM activity_logs al
      LEFT JOIN admin_users au ON al.user_id = au.id
      ORDER BY al.created_at DESC
      LIMIT ?
    `);
        return stmt.all(limit);
    }

    // Statistics
    getStats() {
        const stats = {};

        stats.total = this.db.prepare('SELECT COUNT(*) as count FROM licenses').get().count;
        stats.active = this.db.prepare('SELECT COUNT(*) as count FROM licenses WHERE status = ?').get('active').count;
        stats.pending = this.db.prepare('SELECT COUNT(*) as count FROM licenses WHERE status = ?').get('pending').count;
        stats.revoked = this.db.prepare('SELECT COUNT(*) as count FROM licenses WHERE status = ?').get('revoked').count;
        stats.expired = this.db.prepare('SELECT COUNT(*) as count FROM licenses WHERE expires_at < ?').get(new Date().toISOString()).count;

        // Recent activity
        stats.recentActivations = this.db.prepare(`
      SELECT COUNT(*) as count FROM licenses 
      WHERE activated_at > datetime('now', '-7 days')
    `).get().count;

        stats.recentValidations = this.db.prepare(`
      SELECT COUNT(*) as count FROM validation_logs 
      WHERE created_at > datetime('now', '-7 days')
    `).get().count;

        return stats;
    }

    close() {
        this.db.close();
    }
}

module.exports = LicenseDatabase;


