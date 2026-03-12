#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { sql } = require('@vercel/postgres');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const [key, ...valueParts] = trimmed.split('=');
    if (key && !process.env[key]) {
      let value = valueParts.join('=').trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  });
}

const profiles = [
  { username: 'jblack', password: 'jblack784!' },
  { username: 'markg', password: 'markg324!' },
  { username: 'lsierra', password: 'lsierra903!' },
];

async function upsertProfile({ username, password }) {
  const normalizedUsername = username.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 10);

  const existingUser = await sql`
    SELECT id FROM users WHERE LOWER(username) = ${normalizedUsername}
  `;

  if (existingUser.rows.length > 0) {
    const userId = existingUser.rows[0].id;
    await sql`
      UPDATE users
      SET username = ${normalizedUsername}, password_hash = ${passwordHash}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${userId}
    `;
    return { action: 'updated', userId, username: normalizedUsername };
  }

  const created = await sql`
    INSERT INTO users (username, password_hash)
    VALUES (${normalizedUsername}, ${passwordHash})
    RETURNING id
  `;

  return {
    action: 'created',
    userId: created.rows[0].id,
    username: normalizedUsername,
  };
}

async function run() {
  try {
    console.log('\nCreating/updating login profiles...\n');

    for (const profile of profiles) {
      const result = await upsertProfile(profile);
      console.log(`✓ ${result.action}: ${result.username} (id: ${result.userId})`);
    }

    console.log('\nDone.\n');
    process.exit(0);
  } catch (error) {
    console.error('\nFailed to create login profiles:', error.message);
    process.exit(1);
  }
}

run();
