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
        const usersQuery = `SELECT id, username, image, about, firstname FROM users ORDER BY username ASC LIMIT $1 OFFSET $2`;
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

    if (parseInt(userID) !== req.user.id && !req.user.is_admin) {
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
            twitter: req.body.twitter || "",
            bluesky: req.body.bluesky || "",
            instagram: req.body.instagram || "",
            facebook: req.body.facebook || "",
            discord: req.body.discord || "",
            snapchat: req.body.snapchat || "",
            tiktok: req.body.tiktok || "",
            threads: req.body.threads || "",
            reddit: req.body.reddit || "",
            twitch: req.body.twitch || "",
            youtube: req.body.youtube || "",
            vimeo: req.body.vimeo || "",
            patreon: req.body.patreon || "",
            kofi: req.body.kofi || "",
            venmo: req.body.venmo || "",
            cashapp: req.body.cashapp || "",
            paypal: req.body.paypal || "",
            gofundme: req.body.gofundme || "",
            extralife: req.body.extralife || "",
            etsy: req.body.etsy || "",
            complete: req.body.complete || "",
            inprogress: req.body.inprogress || "",
            cosplaygroup: req.body.cosplaygroup || "",
            imawhat:req.body.imawhat || "",
            location: req.body.location || "",
            image: imageUrl || "",
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