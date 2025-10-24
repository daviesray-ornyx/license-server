require('dotenv').config();
const LicenseDatabase = require('./models/database-pg');
const bcrypt = require('bcryptjs');

async function createUser() {
    const db = new LicenseDatabase(process.env.DATABASE_URL);

    try {
        await db.initialize();

        // Get username, password, and email from command line arguments or use defaults
        const username = process.argv[2] || 'newuser';
        const password = process.argv[3] || 'password123';
        const email = process.argv[4] || null;

        console.log('👤 Creating new user...');
        console.log(`   Username: ${username}`);
        console.log(`   Email: ${email || 'Not provided'}`);

        // Check if user already exists
        const existingUser = await db.getAdminUser(username);
        if (existingUser) {
            console.log('⚠️  User already exists. Updating password...');
            
            // Delete activity logs first to avoid foreign key constraint if needed
            await db.pool.query('DELETE FROM activity_logs WHERE user_id = $1', [existingUser.id]);
            
            // Delete existing user
            await db.pool.query('DELETE FROM admin_users WHERE username = $1', [username]);
            console.log('   Deleted existing user');
        }

        // Create new user with hashed password
        const passwordHash = await bcrypt.hash(password, 10);
        const newUser = await db.createAdminUser(username, passwordHash, email);

        console.log('✅ User created successfully!');
        console.log(`   User ID: ${newUser.id}`);
        console.log(`   Username: ${newUser.username}`);
        console.log(`   Email: ${newUser.email || 'None'}`);
        console.log(`   Password: ${password}`);
        console.log('');
        console.log('The user can now login at http://localhost:3001');

        await db.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        await db.close();
        process.exit(1);
    }
}

// Usage:
// node create-user.js username password email
// Example: node create-user.js neil.judd@thriiver.co.uk "Neil@2024$" neil.judd@thriiver.co.uk

createUser();

