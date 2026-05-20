const express = require("express");
const multer = require("multer");
const path = require("path");
const db = require("../db"); 
const fs = require("fs");
const bcrypt = require("bcryptjs");
const authenticateJWT = require("../authMiddleware");

const router = express.Router();
router.use(authenticateJWT);

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const username = req.body.username;
        if (!username) {
            return cb(new Error("Username is required for image upload"));
        }
        const userFolder = path.join(__dirname, `../uploads/${username}`);
        fs.mkdirSync(userFolder, { recursive: true });
        cb(null, userFolder);
    },
    filename: (req, file, cb) => {
        const filename = Date.now() + path.extname(file.originalname);
        cb(null, filename);
    },
});

const upload = multer({ storage: storage });

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
        // FIX: Aliased ID for frontend support, updated table naming schema
        const usersQuery = `SELECT id AS "ID", username, image, about, firstname FROM users LIMIT $1 OFFSET $2`;
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
        // 1. Fetch what we currently have in the database for this user
        const existingUserCheck = await db.query("SELECT birthdate FROM users WHERE id = $1", [userID]);
        
        if (existingUserCheck.rows.length === 0) {
            return res.status(404).json({ message: "User account not found." });
        }

        const currentBirthdate = existingUserCheck.rows[0].birthdate;

        // 2. Determine final birthdate value (Prioritize incoming form data, fallback to database)
        let finalBirthdate = req.body.birthdate && req.body.birthdate.trim() !== "" 
            ? req.body.birthdate 
            : currentBirthdate;

        // 3. Throw a strict error if it evaluates to empty or null
        if (!finalBirthdate) {
            return res.status(400).json({ message: "Birthdate is a strictly required field and cannot be empty!" });
        }

        let hashedPassword = null;
        if (password) {
            hashedPassword = await bcrypt.hash(password, 10);
        }

        let image = req.body.image;
        if (req.file) {
            // Forces secure https layout mapping
            image = `https://${req.get("host")}/uploads/${req.body.username}/${req.file.filename}`;
        }

        // 4. Update your fields mapper configuration object
        const updateFields = {
            firstname: req.body.firstname || "",
            lastname: req.body.lastname || "",
            birthdate: finalBirthdate, // Safely assigned and validated!
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

        if (hashedPassword) {
            updateFields.hashedpassword = hashedPassword;
        }

        // Builds dynamic string with safe Postgres parameter references ($1, $2, etc)
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