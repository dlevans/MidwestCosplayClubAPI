const { Pool } = require('pg');

// Create a new connection pool using Render's single connection string
  const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {    rejectUnauthorized: false  },
  max: 50, // Replaces connectionLimit: 50
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
 

// Mirror the promise-based query execution of your old mysql2 setup
const db = {
  query: (text, params) => pool.query(text, params),
  execute: (text, params) => pool.query(text, params), // Map execute to query since pg uses query for everything
};

module.exports = db;