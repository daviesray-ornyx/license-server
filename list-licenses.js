#!/usr/bin/env node

/**
 * Quick script to list all licenses in the database
 * Usage: node list-licenses.js
 */

const Database = require('./models/database');

const db = new Database();

try {
    const licenses = db.getAllLicenses({ limit: 100 });

    console.log('\n📋 Licenses in Database');
    console.log('='.repeat(80));

    if (licenses.length === 0) {
        console.log('\n⚠️  No licenses found in database!');
        console.log('\n💡 Create a test license:');
        console.log('   node create-test-license.js');
        console.log('\n   Or use the admin portal to generate licenses.\n');
        return;
    }

    console.log(`\nTotal: ${licenses.length} license(s)\n`);

    licenses.forEach((license, idx) => {
        console.log(`${idx + 1}. ${license.license_key}`);
        console.log(`   Kiosk: ${license.kiosk_name || 'N/A'}`);
        console.log(`   Status: ${license.status || 'N/A'}`);
        console.log(`   Location: ${license.location_restaurant || 'N/A'}, ${license.location_country || 'N/A'}`);
        console.log(`   Issued: ${license.issued_at || 'N/A'}`);
        console.log(`   Expires: ${license.expires_at || 'N/A'}`);
        console.log(`   Activated: ${license.activated_at ? 'Yes - ' + license.activated_at : 'No'}`);
        console.log('');
    });

    console.log('='.repeat(80) + '\n');

} catch (error) {
    console.error('\n❌ Error listing licenses:', error.message);
    console.error(error.stack);
    process.exit(1);
}

