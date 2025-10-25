#!/usr/bin/env node

/**
 * Quick script to create a test license
 * Usage: node create-test-license.js [license-key]
 */

const Database = require('./models/database');
const { generateLicenseKey } = require('./utils/crypto');

const db = new Database();

// Get license key from command line or generate new one
const licenseKey = process.argv[2] || generateLicenseKey('KFC-KIO', 'UK');

const licenseData = {
    licenseKey: licenseKey,
    kioskName: 'Test Kiosk - Development',
    location: {
        restaurant: 'Test Restaurant',
        country: 'UK',
        region: 'London'
    },
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
};

try {
    console.log('\n🔑 Creating Test License');
    console.log('='.repeat(60));
    console.log('License Key:', licenseData.licenseKey);
    console.log('Kiosk Name:', licenseData.kioskName);
    console.log('Location:', `${licenseData.location.restaurant}, ${licenseData.location.country}`);
    console.log('Issued At:', licenseData.issuedAt);
    console.log('Expires At:', licenseData.expiresAt);
    console.log('='.repeat(60));

    db.createLicense(licenseData);

    console.log('\n✅ License created successfully!');
    console.log('\n📋 Use this license key to test:');
    console.log('\x1b[32m%s\x1b[0m', licenseData.licenseKey);
    console.log('\n💡 Copy and paste this into the Electron app activation dialog.\n');

} catch (error) {
    console.error('\n❌ Error creating license:', error.message);
    if (error.message.includes('UNIQUE')) {
        console.log('💡 License key already exists. Use a different key or delete the existing one.\n');
    }
    process.exit(1);
}

