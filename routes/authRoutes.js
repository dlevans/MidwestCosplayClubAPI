const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { sql, poolPromise } = require("../db");

const router = express.Router();
const JWT_SECRET = "snYUAu:<-NyX2>W=w`p[j~9r!(7JzaD5";
const JWT_EXPIRES_IN = "24h";

router.post("/", async (req, res) => {
  console.log("post /login");
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required" });
  }

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("username", sql.NVarChar, username)
      .query("SELECT * FROM [dbo].[Users] WHERE [username] = @username");      

    if (result.recordset.length === 0) return res.status(404).json({ message: "User not found" });

    const user = result.recordset[0];   
    const isMatch = await bcrypt.compare(password, user.hashedpassword);
    if (!isMatch) return res.status(400).json({ message: "Invalid password!" });

    const token = jwt.sign({ id: user.ID, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.json({ token });

  } catch (err) {
    res.status(500).json({ message: "Server error during login", error: err });
  }
});

module.exports = router;
