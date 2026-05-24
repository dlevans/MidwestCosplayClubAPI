const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("db"); // Import our Postgres Pool from db.js
require('dotenv').config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = "24h";


router.post("/", async (req, res) => {
  console.log("POST /login");
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required" });
  }

  try {
    // 1. Capture the full Postgres result object (No square brackets around variable name)
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    const rows = result.rows;

    // Check if the user exists
    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = rows[0];

    // Compare password with hashed password in the database
    const isMatch = await bcrypt.compare(password, user.hashedpassword);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid password!" });
    }

    // 2. Create JWT token (Changed user.ID to lowercase user.id to match the database)
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    // 3. Send both token and username back to match what your React Login.js expects
    return res.json({ 
      token: token, 
      username: user.username 
    });

  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({ message: "Server error during login", error: err });
  }
});

module.exports = router;