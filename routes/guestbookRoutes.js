const express = require("express");
const db = require("../db");
const authenticateJWT = require("../authMiddleware");

const router = express.Router();
router.use(authenticateJWT);

const MAX_MESSAGE_LENGTH = 500;

/*
 * Post a new guestbook entry on a user's profile.
 * Requires auth — the logged-in user (from the JWT) is the entry's author.
 */
router.post("/:username", async (req, res) => {
    console.log("POST /guestbook/:username");
    const { username } = req.params;
    const message = (req.body.message || "").trim();

    if (!message) {
        return res.status(400).json({ message: "Message is required." });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ message: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.` });
    }

    try {
        const profileResult = await db.query(
            "SELECT id FROM users WHERE LOWER(username) = LOWER($1)",
            [username]
        );
        if (profileResult.rows.length === 0) {
            return res.status(404).json({ message: "User not found." });
        }
        const profileUserId = profileResult.rows[0].id;

        const insertResult = await db.query(
            `INSERT INTO guestbook (profileuserid, authoruserid, message)
             VALUES ($1, $2, $3)
             RETURNING id`,
            [profileUserId, req.user.id, message]
        );

        // Re-select through the same join shape the profile page reads,
        // so the response is ready to render immediately on the frontend.
        const entryResult = await db.query(
            `SELECT gb.id, gb.message, gb.createdat, gb.authoruserid AS authorid,
                    au.username AS authorusername, au.image AS authorimage
             FROM guestbook gb
             JOIN users au ON au.id = gb.authoruserid
             WHERE gb.id = $1`,
            [insertResult.rows[0].id]
        );

        return res.status(201).json(entryResult.rows[0]);
    } catch (err) {
        console.error("Error posting guestbook entry:", err);
        return res.status(500).json({ message: "Error posting guestbook entry" });
    }
});

/*
 * Delete a guestbook entry. Allowed for the entry's original author
 * or the owner of the profile it was posted on.
 */
router.delete("/:entryId", async (req, res) => {
    console.log("DELETE /guestbook/:entryId");
    const entryId = parseInt(req.params.entryId, 10);

    if (!req.params.entryId || isNaN(entryId)) {
        return res.status(400).json({ message: "Invalid entry ID." });
    }

    try {
        const entryResult = await db.query(
            "SELECT authoruserid, profileuserid FROM guestbook WHERE id = $1",
            [entryId]
        );
        if (entryResult.rows.length === 0) {
            return res.status(404).json({ message: "Entry not found." });
        }

        const { authoruserid, profileuserid } = entryResult.rows[0];
        if (req.user.id !== authoruserid && req.user.id !== profileuserid) {
            return res.status(403).json({ message: "You can't remove this entry." });
        }

        await db.query("DELETE FROM guestbook WHERE id = $1", [entryId]);
        return res.status(200).json({ message: "Entry removed." });
    } catch (err) {
        console.error("Error deleting guestbook entry:", err);
        return res.status(500).json({ message: "Error deleting guestbook entry" });
    }
});

module.exports = router;