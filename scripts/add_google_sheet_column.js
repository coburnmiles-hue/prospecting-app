#!/usr/bin/env node

/**
 * Script to add google_sheet_id column to users table
 */

const fs = require('fs');
const path = require('path');
const { sql } = require('@vercel/postgres');

// Load environment variables
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

async function addGoogleSheetColumn() {
  try {
    console.log('\n📋 Adding google_sheet_id column to users table...\n');

    // Add the column if it doesn't exist
    await sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS google_sheet_id VARCHAR(500)
    `;

    console.log('✓ Column added successfully');
    console.log('\n✅ Migration complete!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

addGoogleSheetColumn();
