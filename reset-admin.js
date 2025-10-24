require('dotenv').config();
const LicenseDatabase = require('./models/database-pg');
const bcrypt = require('bcryptjs');

async function resetAdmin() {
    const db = new LicenseDatabase(process.env.DATABASE_URL);

    try {
        await db.initialize();

        const username = process.env.ADMIN_USERNAME || 'admin';
        const password = process.env.ADMIN_PASSWORD || 'admin123';

        console.log('🔧 Resetting admin user...');
        console.log(`   Username: ${username}`);

        // Delete activity logs first to avoid foreign key constraint
        await db.pool.query('DELETE FROM activity_logs WHERE user_id IN (SELECT id FROM admin_users WHERE username = $1)', [username]);

        // Delete existing admin user
        const deleteQuery = 'DELETE FROM admin_users WHERE username = $1';
        await db.pool.query(deleteQuery, [username]);

        // Create new admin user with proper password
        const passwordHash = await bcrypt.hash(password, 10);
        await db.createAdminUser(username, passwordHash, null);

        console.log('✅ Admin user reset successfully!');
        console.log(`   Username: ${username}`);
        console.log(`   Password: ${password}`);
        console.log('');
        console.log('You can now login at http://localhost:3001');

        await db.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        await db.close();
        process.exit(1);
    }
}

resetAdmin();


