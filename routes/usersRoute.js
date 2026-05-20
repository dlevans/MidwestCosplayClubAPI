const express = require("express");
const cloudinary = require('cloudinary').v2;
const path = require("path");
const db = require("../db"); 
const fs = require("fs");
const bcrypt = require("bcryptjs");
const authenticateJWT = require("../authMiddleware");

const router = express.Router();
router.use(authenticateJWT);

cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_NAME, 
  api_key: process.env.CLOUDINARY_API, 
  api_secret: process.env.CLOUDINARY_API_SECRET
});

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
        const usersQuery = `SELECT id, username, image, about, firstname FROM users LIMIT $1 OFFSET $2`;
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

    // 1. Sanity check: verify ID is a valid number parameter
    if (!userID || userID === "undefined" || isNaN(parseInt(userID))) {
        console.error("Invalid User ID string blocked:", userID);
        return res.status(400).json({ message: "Invalid or missing User ID parameter." });
    }

    try {
        // 2. Query utilizing wildcard selection to capture all active Postgres layout matching rows
        const query = `SELECT * FROM users WHERE id = $1`;
        const result = await db.query(query, [parseInt(userID, 10)]);

        // 3. Verify rows existence safely
        if (!result || !result.rows || result.rows.length === 0) {
            console.log(`No database record found matching User ID: ${userID}`);
            return res.status(404).json({ message: "User not found" });
        }

        // 4. Send back exactly the single row data object natively
        console.log(`Successfully retrieved database profile for User ID: ${userID}`);
        return res.status(200).json(result.rows[0]);

    } catch (err) {
        // 5. Log the EXACT Postgres traceback to your Render console log tracking dashboard
        console.error("CRITICAL EXCEPTION inside GET /users/:id route handler:", err);
        return res.status(500).json({ 
            message: "Internal server error inside query runner engine.", 
            error: err.message 
        });
    }
});

/*
 * Update Profile Route
 */
router.put("/update/:id", upload.single("image"), async (req, res) => {
    console.log("PUT /update/:id");
    const userID = req.params.id; 

    if (!userID || userID === "undefined" || isNaN(parseInt(userID))) {
        return res.status(400).json({ message: "Invalid or missing User ID parameter." });
    }
    const { password } = req.body;

    try {
        const existingUserCheck = await db.query("SELECT birthdate FROM users WHERE id = $1", [userID]);
        
        if (existingUserCheck.rows.length === 0) {
            return res.status(404).json({ message: "User account not found." });
        }

        const currentBirthdate = existingUserCheck.rows[0].birthdate;

        let finalBirthdate = req.body.birthdate && req.body.birthdate.trim() !== "" 
            ? req.body.birthdate 
            : currentBirthdate;

        if (!finalBirthdate) {
            return res.status(400).json({ message: "Birthdate is a strictly required field and cannot be empty!" });
        }

        let hashedPassword = null;
        if (password) {
            hashedPassword = await bcrypt.hash(password, 10);
        }

        let image = req.body.image;
        if (req.file) {
            // Upload the buffer directly to Cloudinary
            const result = await cloudinary.uploader.upload_stream(
                { folder: 'midwest-cosplay', public_id: req.body.username }, 
                (error, result) => { /* handle results */ }
            ).end(req.file.buffer);

            // Save result.secure_url into your database
            updateFields.image = result.secure_url;
        }

        const updateFields = {
            firstname: req.body.firstname || "",
            lastname: req.body.lastname || "",
            birthdate: finalBirthdate,
            username: req.body.username || "",
            about: req.body.about || "",
            email: req.body.email || "",
            phonenumber: req.body.phonenumber || "",
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
            imawhat: req.body.imawhat || "",
            image: image || "",
            location: req.body.location || ""
        };

        if (password && password.trim() !== "") {
            updateFields.hashedpassword = await bcrypt.hash(password, 10);
        }

        const fields = Object.keys(updateFields).map((key, index) => `${key} = $${index + 1}`).join(", ");
        const values = Object.values(updateFields);
        
        values.push(userID);
        const query = `UPDATE users SET ${fields} WHERE id = $${values.length}`;

        await db.query(query, values);

        return res.status(200).json({ message: "User updated successfully" });
    } catch (err) {
        console.error("Error updating user table row profiles:", err);
        return res.status(500).json({ message: "Error updating user profiles in database" });
    }
});

module.exports = router;