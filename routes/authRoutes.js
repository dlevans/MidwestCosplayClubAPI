const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db"); // Fixed: was imported as 'db' but used as 'pool' everywhere
const authenticateJWT = require("../authMiddleware");
require('dotenv').config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = "24h";

// Add this route — returns 200 if token is valid, 403 if not
router.get("/verify", authenticateJWT, (req, res) => {
  res.status(200).json({ valid: true, user: req.user });
});


router.post("/", async (req, res) => {
  console.log("POST /login");
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required" });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE LOWER(username) = LOWER($1)", [username]);
    const rows = result.rows;

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = rows[0];

    const isMatch = await bcrypt.compare(password, user.hashedpassword);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid password!" });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    return res.json({ 
      token: token, 
      username: user.username,
      id: user.id
    });

  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({ message: "Server error during login", error: err });
  }
});

module.exports = router;