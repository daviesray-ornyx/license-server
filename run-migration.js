#!/usr/bin/env node

/**
 * Database Migration Runner
 * Runs analytics users migration
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

async function runMigration() {
    if (!process.env.DATABASE_URL) {
        console.error('❌ DATABASE_URL environment variable is required');
        console.error('   Please set it in your .env file');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        console.log('🗄️ Connecting to database...');

        // Test connection
        await pool.query('SELECT NOW()');
        console.log('✅ Database connection successful');

        // Read migration file
        const migrationPath = path.join(__dirname, 'migrations', '003_analytics_users.sql');
        if (!fs.existsSync(migrationPath)) {
            console.error('❌ Migration file not found:', migrationPath);
            process.exit(1);
        }

        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        console.log('📄 Running analytics users migration...');

        // Execute migration
        await pool.query(migrationSQL);

        console.log('✅ Migration completed successfully!');
        console.log('📊 Analytics users tables created:');
        console.log('   - analytics_users (email, password_hash, license_key)');
        console.log('   - analytics_sessions (JWT tokens, 30-day validity)');
        console.log('   - Indexes and constraints added');
        console.log('   - Triggers for auto-updating timestamps');

        // Verify tables were created
        const tablesResult = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('analytics_users', 'analytics_sessions')
            ORDER BY table_name
        `);

        console.log('📋 Created tables:');
        tablesResult.rows.forEach(row => {
            console.log(`   ✓ ${row.table_name}`);
        });

    } catch (error) {
        console.error('❌ Migration failed:', error.message);

        if (error.code === '42P07') {
            console.log('ℹ️  Tables already exist - migration may have been run before');
        } else if (error.code === 'ECONNREFUSED') {
            console.log('ℹ️  Could not connect to database. Please check:');
            console.log('   - Database server is running');
            console.log('   - DATABASE_URL is correct');
            console.log('   - Network connectivity');
        }

        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run if called directly
if (require.main === module) {
    runMigration();
}

module.exports = runMigration;
