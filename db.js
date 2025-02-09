const sql = require("mssql");

const config = {
  //user: process.env.user,
  //password: process.env.password,
  //server: process.env.server,
  //database: process.env.database,
  options: { encrypt: true, trustServerCertificate: false },
};

const poolPromise = sql.connect(config)
  .then(pool => {
    console.log("Connected to Azure SQL Database!");
    return pool;
  })
  .catch(err => {
    console.error("Database connection failed:", err);
    process.exit(1);
  });

module.exports = { sql, poolPromise };
