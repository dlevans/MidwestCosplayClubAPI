const express = require("express");
const db = require("../db");

const router = express.Router();

/*
*   Get a single user by username
*/
router.get("/:username", async (req, res) => {  
    console.log("get public/username");

    const username = req.params.username;
    const query = `SELECT firstname, lastname, username, about, imawhat, email, phonenumber, image, twitter, bluesky, instagram, facebook, discord, 
                   snapchat, tiktok, threads, reddit, twitch, youtube, vimeo, patreon, kofi, venmo, cashapp, paypal, gofundme, extralife, etsy, calendar, 
                   complete, inprogress, cosplaygroup 
                   FROM Users WHERE username = ?`;

    // Verify db connection is available
    if (!db || !db.query) {
        console.error("Database connection is not available.");
        return res.status(500).json({ message: "Database connection is not available" });
    }

    try {
        // Execute the query using async/await
        const [results] = await db.query(query, [username]);

        if (results.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json(results[0]); // Send the user as JSON
    } catch (err) {
        console.error("Error fetching user:", err);
        res.status(500).json({ message: "Error fetching user data", error: err.message });
    }
});

module.exports = router;
