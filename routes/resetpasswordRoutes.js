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
        const [user] = await db.execute("SELECT * FROM Users WHERE reset_token = ? AND reset_expires > NOW()", [token]);
  
        if (user.length === 0) {
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

    if (!username) {
        return res.status(400).json({ error: "Username is required" });
    }

    try {
        // Check if user exists
        const [user] = await db.execute("SELECT email FROM Users WHERE username = ?", [username]);

        if (user.length === 0) {
            console.log("User not found.");
            return res.status(200).json({ message: "If this account exists, you will receive an email." });
        }

        const userEmail = user[0].email;

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString("hex");

        // Store reset token in DB with expiration
        const expirationTime = new Date(Date.now() + 3600000); // 1 hour expiration
        await db.execute("UPDATE Users SET reset_token = ?, reset_expires = ? WHERE username = ?", [
            resetToken,
            expirationTime,
            username,
        ]); 
        
        await sendResetEmail(userEmail, resetToken);

        return res.status(200).json({ message: "If this account exists, you will receive an email." });
    } catch (error) {
        console.error("Error in password reset:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});



/*
 * Step 3: Reset Password
 */
router.post("/token/:token", async (req, res) => {  // Fixed route
    console.log("/token/:token");
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
        return res.status(400).json({ error: "Password is required." });
    }

    try {
        // Check if token exists and is not expired
        const [user] = await db.execute("SELECT * FROM Users WHERE reset_token = ? AND reset_expires > NOW()", [token]);

        if (user.length === 0) {
            return res.status(400).json({ error: "Invalid or expired token." });
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Update the user's password in the database
        await db.execute("UPDATE Users SET hashedpassword = ?, reset_token = NULL, reset_expires = NULL WHERE reset_token = ?", [
            hashedPassword,
            token,
        ]);

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error("Error resetting password:", error);
        return res.status(500).json({ error: "Server error" });
    }
});

module.exports = router;
