const express = require("express");
const db = require("../..db");

const router = express.Router();

/*
* Get a single user by username
*/
router.get("/:username", async (req, res) => {  
    console.log("get public/username");

    const username = req.params.username;
    // Changed table to lowercase 'users'
    const query = `SELECT firstname, lastname, username, about, imawhat, email, phonenumber, image, twitter, bluesky, instagram, facebook, discord, 
                   snapchat, tiktok, threads, reddit, twitch, youtube, vimeo, patreon, kofi, venmo, cashapp, paypal, gofundme, extralife, etsy, calendar, 
                   complete, inprogress, cosplaygroup 
                   FROM users WHERE username = $1`;

    if (!db || !db.query) {
        console.error("Database connection is not available.");
        return res.status(500).json({ message: "Database connection is not available" });
    }

    try {
        // FIX: Removed the brackets [] from destructuring
        const result = await db.query(query, [username]);
        const rows = result.rows;

        if (rows.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        return res.status(200).json(rows[0]); // Send the user row
    } catch (err) {
        console.error("Error fetching user:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
});

module.exports = router;