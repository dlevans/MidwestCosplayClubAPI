const express = require("express");
const multer = require("multer");
const path = require("path");
const db = require("../db"); // Import MySQL connection
const fs = require("fs");
const bcrypt = require("bcryptjs");
const authenticateJWT = require("../authMiddleware");

const router = express.Router();
router.use(authenticateJWT);

// Serve uploaded images statically
router.use('/uploads', express.static(path.join(__dirname, '../uploads')));

/*
 * Multer setup to store images in /uploads/<username>/
 */
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
 * Get all users
 */
router.get("/", async (req, res) => {
    console.log("GET all /users");

    const { limit = 10, page = 1 } = req.query;  // Default limit is 10, default page is 1
    const offset = (page - 1) * limit;

    try {
        const [results] = await db.query(
            "SELECT ID, firstname, lastname, imawhat, email, birthdate, phonenumber, username, about, image FROM Users ORDER BY username ASC LIMIT ? OFFSET ? ",
            [parseInt(limit), parseInt(offset)]
        );

        const [[{ total }]] = await db.query("SELECT COUNT(*) as total FROM Users");

        res.status(200).json({ users: results, total });
    } catch (err) {
        console.error("Error fetching users:", err);
        res.status(500).json({ message: "Error fetching users", error: err });
    }
});

/*
 * Get a single user by ID
 */
router.get("/:ID", async (req, res) => {
    console.log("GET /users/:ID");
    const userID = req.params.ID;

    try {
        const [results] = await db.query(
            "SELECT firstname, lastname, imawhat, birthdate, phonenumber, username, email, about, image, other, calendar, twitter, bluesky, instagram, facebook, discord, snapchat, tiktok, threads, reddit, twitch, youtube, vimeo, patreon, kofi, venmo, cashapp, paypal, gofundme, extralife, etsy, complete, inprogress, cosplaygroup FROM Users WHERE ID = ?",
            [userID]
        );

        if (results.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json(results[0]);
    } catch (err) {
        console.error("Error fetching user:", err);
        res.status(500).json({ message: "Error fetching user data", error: err });
    }
});

/*
 * Update a user
 */
router.put("/:ID", upload.single("image"), async (req, res) => {
    console.log("PUT /users/:ID");
    const userID = parseInt(req.params.ID);

    if (req.user.id !== userID) {
        return res.status(403).json({ message: "You can only update your own profile" });
    }

    let image = req.body.image || "";
    if (req.file) {
        image = `${req.protocol}://${req.get("host")}/uploads/${req.body.username}/${req.file.filename}`;
    }

    try {
        let hashedPassword = null;
        if (req.body.password) {
            hashedPassword = await bcrypt.hash(req.body.password, 10);
        }

        const updateFields = {
            firstname: req.body.firstname || "",
            lastname: req.body.lastname || "",
            email: req.body.email || "",
            birthdate: req.body.birthdate || "",
            phonenumber: req.body.phonenumber || "",
            about: req.body.about || "",
            other: req.body.other || "",
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
            image: image || "",
        };

        if (hashedPassword) {
            updateFields.hashedpassword = hashedPassword;
        }

        const fields = Object.keys(updateFields).map((key) => `${key} = ?`).join(", ");
        const values = Object.values(updateFields);
        values.push(userID);

        const query = `UPDATE Users SET ${fields} WHERE ID = ?`;

        await db.query(query, values);

        res.status(200).json({ message: "User updated successfully" });
    } catch (err) {
        console.error("Error:", err);
        res.status(500).json({ message: "Error updating user data", error: err });
    }
});

/*
 * Delete a user
 */
router.delete("/:ID", async (req, res) => {
    console.log("DELETE /users/:ID");

});

module.exports = router;
