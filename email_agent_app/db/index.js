const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is not defined in the environment variables.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  max: 20,
  min: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

async function checkHealth() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    return true;
  } catch (err) {
    console.error('Database health check failed:', err);
    return false;
  } finally {
    client.release();
  }
}

// Graceful shutdown handler
async function close() {
  console.log('Closing database pool...');
  await pool.end();
  console.log('Database pool closed.');
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  checkHealth,
  close,
};
