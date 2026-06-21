const express = require("express");
const db = require("../db");
const crypto = require("crypto");
const bcrypt = require("bcryptjs"); 
const sendResetEmail = require("../sendResetEmail");

const router = express.Router();

/*
 * Step 2: Verify Token
 */
router.get("/verify-reset-token", async (req, res) => {
    console.log("/verify-reset-token");
    const { token } = req.query;

    if (!token) {
        return res.status(400).json({ error: "No token provided." });
    }
  
    try {
        // FIX: Removed array destructuring, mapped table to lowercase 'users'
        const result = await db.query("SELECT * FROM users WHERE reset_token = $1 AND reset_expires > NOW()", [token]);
  
        if (result.rows.length === 0) {
            return res.status(400).json({ error: "Invalid or expired token." });
        }
  
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error("Error verifying token:", error);
        return res.status(500).json({ error: "Server error" });
    }
});

/*
 * Step 1: Request Reset Link
 */
router.get("/:username", async (req, res) => {
    console.log("get resetpassword/username");
    const username = req.params.username;

    try {
        // FIX: Mapped to lowercase 'users' table and fixed destructuring
        const result = await db.query("SELECT * FROM users WHERE LOWER(username) = LOWER($1)", [username]);
        const rows = result.rows;

        if (rows.length === 0) {
            return res.status(200).json({ message: "If this account exists, you will receive an email." });
        }

        const user = rows[0];
        const token = crypto.randomBytes(20).toString("hex");
        const expires = new Date(Date.now() + 3600000); // 1 hour

        // FIX: Updated to Postgres numbering constraints ($1, $2, $3)
        await db.query("UPDATE users SET reset_token = $1, reset_expires = $2 WHERE LOWER(username) = LOWER($3)", [token, expires, username]);

        await sendResetEmail(user.email, token);

        return res.status(200).json({ message: "If this account exists, you will receive an email." });
    } catch (error) {
        console.error("Error in password reset:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

/*
 * Step 3: Reset Password
 */
router.post("/token/:token", async (req, res) => {
    console.log("/token/:token");
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
        return res.status(400).json({ error: "Password is required." });
    }

    try {
        // FIX: Updated database verification handling
        const tokenCheck = await db.query("SELECT * FROM users WHERE reset_token = $1 AND reset_expires > NOW()", [token]);

        if (tokenCheck.rows.length === 0) {
            return res.status(400).json({ error: "Invalid or expired token." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // FIX: Swapped placeholder properties to match Postgres positional numbering
        await db.query("UPDATE users SET hashedpassword = $1, reset_token = NULL, reset_expires = NULL WHERE reset_token = $2", [
            hashedPassword,
            token,
        ]);

        return res.status(200).json({ message: "Password reset successful." });
    } catch (error) {
        console.error("Error updating password:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

module.exports = router;