const fs = require('fs');
const path = require('path');

async function main() {
  // read .env.local
  const envPath = path.resolve(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('.env.local not found');
    process.exit(1);
  }
  const env = fs.readFileSync(envPath, 'utf8');
  const match = env.match(/DATABASE_URL\s*=\s*"?([^\n\r"]+)"?/);
  if (!match) {
    console.error('DATABASE_URL not found in .env.local');
    process.exit(1);
  }
  const DATABASE_URL = match[1].trim();

  const { neon } = require('@neondatabase/serverless');
  const sql = neon(DATABASE_URL);

  const names = ['Nickel City', 'Test Cafe'];
  try {
    const rows = await sql`
      DELETE FROM accounts
      WHERE name = ANY(${names})
      RETURNING id, name
    `;

    console.log('Deleted rows:');
    console.log(rows);
  } catch (err) {
    console.error('Error deleting rows:', err);
    process.exit(1);
  }
}

main();
