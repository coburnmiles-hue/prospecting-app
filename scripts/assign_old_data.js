#!/usr/bin/env node

/**
 * Script to assign all old saved data to a specific user account
 * Usage: node scripts/assign_old_data.js <username>
 */

// Load environment variables
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && !process.env[key]) {
      process.env[key] = valueParts.join('=').trim();
    }
  });
}

const { sql } = require('@vercel/postgres');

async function assignOldData(username) {
  try {
    console.log(`\n📋 Assigning old data to user: ${username}\n`);

    // Get the user ID
    const userResult = await sql`
      SELECT id FROM users WHERE username = ${username}
    `;

    if (userResult.rows.length === 0) {
      console.error(`❌ User "${username}" not found`);
      process.exit(1);
    }

    const userId = userResult.rows[0].id;
    console.log(`✓ Found user ${username} with ID: ${userId}`);

    // Assign all accounts without a user_id
    const accountsResult = await sql`
      UPDATE accounts 
      SET user_id = ${userId}
      WHERE user_id IS NULL
      RETURNING id
    `;
    console.log(`✓ Assigned ${accountsResult.rows.length} accounts to ${username}`);

    // Assign all saved_routes without a user_id
    const routesResult = await sql`
      UPDATE saved_routes 
      SET user_id = ${userId}
      WHERE user_id IS NULL
      RETURNING id
    `;
    console.log(`✓ Assigned ${routesResult.rows.length} routes to ${username}`);

    console.log(`\n✅ Data assignment complete!\n`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error assigning data:', error.message);
    process.exit(1);
  }
}

// Get username from command line arguments
const username = process.argv[2];
if (!username) {
  console.error('Usage: node scripts/assign_old_data.js <username>');
  process.exit(1);
}

assignOldData(username);
