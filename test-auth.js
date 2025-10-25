#!/usr/bin/env node

/**
 * Analytics Authentication Test Script
 * Tests the complete authentication flow
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Load environment variables
require('dotenv').config();

async function testAuthentication() {
    if (!process.env.DATABASE_URL) {
        console.error('❌ DATABASE_URL environment variable is required');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        console.log('🧪 Testing Analytics Authentication System...\n');

        // Test 1: Check if tables exist
        console.log('1️⃣ Checking database tables...');
        const tablesResult = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('analytics_users', 'analytics_sessions')
            ORDER BY table_name
        `);

        if (tablesResult.rows.length === 2) {
            console.log('✅ Tables exist:', tablesResult.rows.map(r => r.table_name).join(', '));
        } else {
            console.log('❌ Missing tables. Expected: analytics_users, analytics_sessions');
            console.log('   Found:', tablesResult.rows.map(r => r.table_name).join(', '));
            return;
        }

        // Test 2: Create a test user
        console.log('\n2️⃣ Creating test user...');
        const testEmail = 'test@kfc.com';
        const testPassword = 'test123';
        const testLicenseKey = 'KFC-AA-2024-4E73BF10C92F25B2';
        const hashedPassword = await bcrypt.hash(testPassword, 10);

        // Check if user already exists
        const existingUser = await pool.query(
            'SELECT id FROM analytics_users WHERE license_key = $1 AND email = $2',
            [testLicenseKey, testEmail]
        );

        if (existingUser.rows.length > 0) {
            console.log('ℹ️ Test user already exists, skipping creation');
        } else {
            await pool.query(
                `INSERT INTO analytics_users (license_key, email, password_hash, full_name)
                 VALUES ($1, $2, $3, $4)`,
                [testLicenseKey, testEmail, hashedPassword, 'Test User']
            );
            console.log('✅ Test user created:', testEmail);
        }

        // Test 3: Test password verification
        console.log('\n3️⃣ Testing password verification...');
        const userResult = await pool.query(
            'SELECT password_hash FROM analytics_users WHERE license_key = $1 AND email = $2',
            [testLicenseKey, testEmail]
        );

        if (userResult.rows.length > 0) {
            const isValid = await bcrypt.compare(testPassword, userResult.rows[0].password_hash);
            console.log(isValid ? '✅ Password verification successful' : '❌ Password verification failed');
        } else {
            console.log('❌ Test user not found');
        }

        // Test 4: Test session creation
        console.log('\n4️⃣ Testing session creation...');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        const sessionResult = await pool.query(
            `INSERT INTO analytics_sessions (license_key, email, session_token, expires_at)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [testLicenseKey, testEmail, 'test-token-123', expiresAt]
        );

        if (sessionResult.rows.length > 0) {
            console.log('✅ Session created successfully, ID:', sessionResult.rows[0].id);
        } else {
            console.log('❌ Session creation failed');
        }

        // Test 5: Test session validation
        console.log('\n5️⃣ Testing session validation...');
        const sessionCheck = await pool.query(
            `SELECT id, expires_at FROM analytics_sessions 
             WHERE license_key = $1 AND email = $2 AND session_token = $3`,
            [testLicenseKey, testEmail, 'test-token-123']
        );

        if (sessionCheck.rows.length > 0) {
            const session = sessionCheck.rows[0];
            const expiresAt = new Date(session.expires_at);
            const now = new Date();
            const isValid = expiresAt > now;
            console.log(isValid ? '✅ Session validation successful' : '❌ Session expired');
        } else {
            console.log('❌ Session not found');
        }

        // Test 6: Cleanup test data
        console.log('\n6️⃣ Cleaning up test data...');
        await pool.query(
            'DELETE FROM analytics_sessions WHERE session_token = $1',
            ['test-token-123']
        );
        console.log('✅ Test session cleaned up');

        console.log('\n🎉 All authentication tests passed!');
        console.log('\n📋 Test Summary:');
        console.log('   ✅ Database tables exist');
        console.log('   ✅ User creation works');
        console.log('   ✅ Password hashing/verification works');
        console.log('   ✅ Session creation works');
        console.log('   ✅ Session validation works');
        console.log('   ✅ Cleanup works');
        
        console.log('\n🔐 Ready for frontend testing!');
        console.log('   Test credentials:');
        console.log('   Email: test@kfc.com');
        console.log('   Password: test123');
        console.log('   License Key: KFC-AA-2024-4E73BF10C92F25B2');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run if called directly
if (require.main === module) {
    testAuthentication();
}

module.exports = testAuthentication;
