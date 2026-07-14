const Redis = require('ioredis');
require('dotenv').config();

const valkeyUrl = process.env.VALKEY_URL;

if (!valkeyUrl) {
  console.error('VALKEY_URL is not defined in the environment variables.');
  process.exit(1);
}

// Custom retry strategy with exponential backoff
const retryStrategy = (times) => {
  const maxRetries = 10;
  if (times > maxRetries) {
    console.error(`Valkey connection failed after ${maxRetries} retries.`);
    return null; // Stop retrying
  }
  const delay = Math.min(times * 100, 2000);
  console.log(`Valkey connection retry attempt ${times} in ${delay}ms...`);
  return delay;
};

const valkey = new Redis(valkeyUrl, {
  retryStrategy,
  maxRetriesPerRequest: null, // Critical to avoid crashing during transient disconnects
});

valkey.on('connect', () => {
  console.log('Successfully connected to Valkey cache.');
});

valkey.on('error', (err) => {
  console.error('Valkey cache error:', err.message);
});

// Helpers
async function getJSON(key) {
  try {
    const data = await valkey.get(key);
    if (!data) return null;
    return JSON.parse(data);
  } catch (err) {
    console.error(`Failed to get JSON for key "${key}":`, err);
    return null; // Fallback to DB on cache read failures
  }
}

async function setJSON(key, value, ttlSeconds = null) {
  try {
    const stringified = JSON.stringify(value);
    if (ttlSeconds) {
      await valkey.set(key, stringified, 'EX', ttlSeconds);
    } else {
      await valkey.set(key, stringified);
    }
    return true;
  } catch (err) {
    console.error(`Failed to set JSON for key "${key}":`, err);
    return false; // Non-blocking: continue even if cache write fails
  }
}

async function invalidate(key) {
  try {
    await valkey.del(key);
    return true;
  } catch (err) {
    console.error(`Failed to invalidate key "${key}":`, err);
    return false;
  }
}

// Invalidate keys matching a pattern using SCAN instead of KEYS (production-grade)
async function invalidatePattern(pattern) {
  try {
    let cursor = '0';
    let deletedCount = 0;
    
    do {
      const [newCursor, keys] = await valkey.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = newCursor;
      
      if (keys.length > 0) {
        await valkey.del(...keys);
        deletedCount += keys.length;
      }
    } while (cursor !== '0');
    
    if (deletedCount > 0) {
      console.log(`Invalidated ${deletedCount} keys matching pattern: ${pattern}`);
    }
    return true;
  } catch (err) {
    console.error(`Failed to invalidate pattern "${pattern}":`, err);
    return false;
  }
}

async function checkHealth() {
  try {
    const result = await valkey.ping();
    return result === 'PONG';
  } catch (err) {
    console.error('Valkey health check failed:', err);
    return false;
  }
}

async function close() {
  console.log('Closing Valkey connection...');
  await valkey.quit();
  console.log('Valkey connection closed.');
}

module.exports = {
  client: valkey,
  getJSON,
  setJSON,
  invalidate,
  invalidatePattern,
  checkHealth,
  close,
};
