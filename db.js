const mysql = require('mysql2');

const pool = mysql.createPool({
  host: process.env.host,
  user: process.env.user,
  password: process.env.password,
  database: process.env.database,
  waitForConnections: true,
  connectionLimit: 50, // Adjust based on your needs
  queueLimit: 0
});

// Use promise-based API for async/await
const db = pool.promise();

module.exports = db;
