const express = require("express");
const cloudinary = require('cloudinary').v2;
const multer = require("multer"); // 1. IMPORT MULTER
const db = require("../db");
const bcrypt = require("bcryptjs");
const authenticateJWT = require("../authMiddleware");

const router = express.Router();
router.use(authenticateJWT);

cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_NAME, 
  api_key: process.env.CLOUDINARY_API, 
  api_secret: process.env.CLOUDINARY_API_SECRET
});
 

const upload = multer({ storage: multer.memoryStorage() });

// Characters allowed for each social/username field. Anything not matching
// is stripped before saving (this also removes spaces and "@").
// Keep this in sync with the ALLOWED_CHARS map in Update.js.
const ALLOWED_CHARS = {
  twitter: /[^A-Za-z0-9_]/g,
  bluesky: /[^A-Za-z0-9._-]/g,      // e.g. "name.bsky.social"
  instagram: /[^A-Za-z0-9._]/g,
  facebook: /[^A-Za-z0-9.]/g,
  discord: /[^A-Za-z0-9-]/g,        // invite code only, e.g. "7BH7Hthuz6"
  snapchat: /[^A-Za-z0-9_.-]/g,
  tiktok: /[^A-Za-z0-9_.]/g,
  threads: /[^A-Za-z0-9._]/g,
  reddit: /[^A-Za-z0-9_-]/g,
  twitch: /[^A-Za-z0-9_]/g,
  youtube: /[^A-Za-z0-9_.-]/g,
  vimeo: /[^A-Za-z0-9_-]/g,
  patreon: /[^A-Za-z0-9_-]/g,
  kofi: /[^A-Za-z0-9_-]/g,
  onlyfans: /[^A-Za-z0-9_.-]/g,
  venmo: /[^A-Za-z0-9_-]/g,
  cashapp: /[^A-Za-z0-9_-]/g,       // don't store the leading "$"
  paypal: /[^A-Za-z0-9.-]/g,
  etsy: /[^A-Za-z0-9]/g,
};

// Strip a leading "@" and any characters that field's platform doesn't
// allow in a username (including spaces). This is the source of truth —
// the frontend does the same thing for UX, but the API must not trust it.
function sanitizeSocialField(name, value) {
  const disallowed = ALLOWED_CHARS[name];
  if (!disallowed || !value) return value || "";
  return value.replace(/^@+/, "").replace(disallowed, "");
}


/*
 * Get all users (With Pagination)
 */
router.get("/", async (req, res) => {
    console.log("GET all /users");
    const { limit = 10, page = 1 } = req.query;

    const parsedLimit = parseInt(limit, 10);
    const parsedPage = parseInt(page, 10);
    const offset = (parsedPage - 1) * parsedLimit;

    try {
        const usersQuery = `SELECT id, username, image, about, firstname FROM users WHERE dummyaccount != TRUE ORDER BY username ASC LIMIT $1 OFFSET $2`;
        const usersResult = await db.query(usersQuery, [parsedLimit, offset]);

        const countResult = await db.query("SELECT COUNT(*) AS total FROM users");
        const totalUsers = parseInt(countResult.rows[0].total, 10);

        return res.status(200).json({
            users: usersResult.rows,
            total: totalUsers,
        });
    } catch (err) {
        console.error("Database query error:", err);
        return res.status(500).json({ message: "Error fetching data from database" });
    }
});


/*
 * Get a single user by their numeric ID (For population of Update form)
 */
router.get("/:id", async (req, res) => {
    console.log("GET /users/:id - ID Requested:", req.params.id);
    const userID = req.params.id;

    if (!userID || isNaN(parseInt(userID))) {
        return res.status(400).json({ message: "Invalid User ID parameter." });
    }

    try {
        const query = `SELECT * FROM users WHERE id = $1`;
        const result = await db.query(query, [parseInt(userID, 10)]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        return res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error("Error fetching single user:", err);
        return res.status(500).json({ message: "Error fetching user data", error: err.message });
    }
});


/*
 * Update Profile Route
 */
router.put("/update/:id", upload.single("image"), async (req, res) => {
    console.log("PUT /update/:id");
    const userID = req.params.id;     

    if (!userID || isNaN(parseInt(userID))) {
        return res.status(400).json({ message: "Invalid User ID." });
    }

    if (parseInt(userID) !== parseInt(req.user.id) && !req.user.is_admin) {
    return res.status(403).json({ message: "Not authorized." });
    }

    try {
        const existingUserCheck = await db.query("SELECT birthdate, image FROM users WHERE id = $1", [userID]);
        if (existingUserCheck.rows.length === 0) return res.status(404).json({ message: "User not found." });

        let imageUrl = existingUserCheck.rows[0].image; // Keep old image by default
        if (req.file) {
            const result = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream(
                    { folder: 'midwest-cosplay', public_id: req.body.username }, 
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                ).end(req.file.buffer);
            });
            imageUrl = result.secure_url;
        }

        const updateFields = {
            firstname: req.body.firstname || "",
            lastname: req.body.lastname || "",
            email: req.body.email || "",
            birthdate: req.body.birthdate || "",
            phonenumber: req.body.phonenumber || "",
            about: req.body.about || "",
            calendar: req.body.calendar || "",
            twitter: sanitizeSocialField("twitter", req.body.twitter),
            bluesky: sanitizeSocialField("bluesky", req.body.bluesky),
            instagram: sanitizeSocialField("instagram", req.body.instagram),
            facebook: sanitizeSocialField("facebook", req.body.facebook),
            discord: sanitizeSocialField("discord", req.body.discord),
            snapchat: sanitizeSocialField("snapchat", req.body.snapchat),
            tiktok: sanitizeSocialField("tiktok", req.body.tiktok),
            threads: sanitizeSocialField("threads", req.body.threads),
            reddit: sanitizeSocialField("reddit", req.body.reddit),
            twitch: sanitizeSocialField("twitch", req.body.twitch),
            youtube: sanitizeSocialField("youtube", req.body.youtube),
            vimeo: sanitizeSocialField("vimeo", req.body.vimeo),
            patreon: sanitizeSocialField("patreon", req.body.patreon),
            kofi: sanitizeSocialField("kofi", req.body.kofi),
            venmo: sanitizeSocialField("venmo", req.body.venmo),
            cashapp: sanitizeSocialField("cashapp", req.body.cashapp),
            paypal: sanitizeSocialField("paypal", req.body.paypal),
            gofundme: req.body.gofundme || "",
            extralife: req.body.extralife || "",
            etsy: sanitizeSocialField("etsy", req.body.etsy),
            complete: req.body.complete || "",
            inprogress: req.body.inprogress || "",
            cosplaygroup: req.body.cosplaygroup || "",
            imawhat:req.body.imawhat || "",
            location: req.body.location || "",
            image: imageUrl || "",
            website:  req.body.website  || "",
            website1: req.body.website1 || "",
            website2: req.body.website2 || "",
            website3: req.body.website3 || "",
            onlyfans: sanitizeSocialField("onlyfans", req.body.onlyfans),
        };

        if (req.body.password && req.body.password.trim() !== "") {
            updateFields.hashedpassword = await bcrypt.hash(req.body.password, 10);
        }

        const keys = Object.keys(updateFields);
        const values = Object.values(updateFields);
        const fields = keys.map((key, index) => `${key} = $${index + 1}`).join(", ");
        
        values.push(userID);
        await db.query(`UPDATE users SET ${fields} WHERE id = $${values.length}`, values);

        return res.status(200).json({ message: "User updated successfully" });
    } catch (err) {
        console.error("Update error:", err);
        return res.status(500).json({ message: "Error updating profile", error: err.message });
    }
});


module.exports = router;