// server/engine-v2/db.js
'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  ssl: process.env.DATABASE_SSL !== 'false'
    ? { rejectUnauthorized: false }
    : false,
  statement_timeout: 30000,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  options: '-c search_path=engine_v2,public',
});

async function query(text, params) {
  return pool.query(text, params);
}

async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function end() {
  return pool.end();
}

module.exports = { query, transaction, end, pool };
