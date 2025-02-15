const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db"); // Import MySQL2 connection pool

const router = express.Router();
const JWT_SECRET = "snYUAu:<-NyX2>W=w`p[j~9r!(7JzaD5";
const JWT_EXPIRES_IN = "24h";

router.post("/", async (req, res) => {
  console.log("POST /login");
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required" });
  }

  try {
    // Fetch user by username
    const [rows] = await pool.query("SELECT * FROM Users WHERE username = ?", [username]);

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

    // Create JWT token
    const token = jwt.sign({ id: user.ID, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    // Send the token as the response
    res.json({ token });

  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ message: "Server error during login", error: err });
  }
});

module.exports = router;
