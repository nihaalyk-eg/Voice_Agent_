const db = require('./index');
const Redis = require('ioredis');
require('dotenv').config();

async function clearMetrics() {
  console.log('Clearing all usage metrics and cache...');
  
  // 1. Clear Postgres tables
  try {
    await db.query('TRUNCATE TABLE communications RESTART IDENTITY CASCADE;');
    await db.query('TRUNCATE TABLE work_orders RESTART IDENTITY CASCADE;');
    console.log('Successfully truncated communications and work_orders tables in PostgreSQL.');
  } catch (err) {
    console.error('Error truncating PostgreSQL tables:', err);
  }

  // 2. Clear Valkey/Redis cache
  const valkeyUrl = process.env.VALKEY_URL;
  if (valkeyUrl) {
    try {
      const valkey = new Redis(valkeyUrl);
      await valkey.flushall();
      console.log('Successfully flushed all keys in Valkey cache.');
      await valkey.quit();
    } catch (err) {
      console.error('Error flushing Valkey cache:', err);
    }
  }

  console.log('Metrics clearing completed successfully!');
  db.close();
}

clearMetrics();
