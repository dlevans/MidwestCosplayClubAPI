const express = require("express");
const multer = require("multer");
const path = require("path");
const { sql, poolPromise } = require("../db");
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

        // Ensure the user's uploads folder exists
        fs.mkdirSync(userFolder, { recursive: true });

        cb(null, userFolder);
    },
    filename: (req, file, cb) => {
        const filename = Date.now() + path.extname(file.originalname);
        cb(null, filename);
    },
});

// Initialize multer
const upload = multer({ storage: storage });

/*
 *   Upload an image for a user
 */
router.post("/upload", upload.single("image"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
    }

    const username = req.body.username;
    if (!username) {
        return res.status(400).json({ message: "Username is required" });
    }

    const imageUrl = `${req.protocol}://${req.get("host")}/uploads/${username}/${req.file.filename}`;
    res.status(200).json({ message: "Image uploaded successfully", imageUrl });
});

/*
 *   Get all users
 */
router.get("/", async (req, res) => {
    console.log("GET /users");
    try {
        const pool = await poolPromise;
        const result = await pool.query("SELECT ID, firstname, lastname, email, birthdate, phonenumber, username, about, image FROM [dbo].[Users]");
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ message: "Error fetching users", error: err });
    }
});


/*
 *   Get a single user by ID
 */
router.get("/:ID", (req, res) => {
    console.log("GET /users/:ID");
    const userID = req.params.ID;

    sql.query`SELECT firstname, lastname, birthdate, phonenumber, username, email, about, 
    image, other, calendar, twitter, bluesky, instagram, facebook, discord, snapchat, tiktok, 
    threads, reddit, twitch, youtube, vimeo, patreon, kofi, venmo, paypal, gofundme, extralife, complete, inprogress FROM [dbo].[Users] WHERE [ID] = ${userID}`
        .then(result => {
            if (result.recordset.length === 0) {
                return res.status(404).json({ message: "User not found" });
            }
            res.status(200).json(result.recordset[0]);
        })
        .catch(err => {
            console.error("Error fetching user:", err);
            res.status(500).json({ message: "Error fetching user data", error: err });
        });
});

/*
 *   Update a user (with image support)
 */
router.put("/:ID", upload.single("image"), (req, res) => {
    console.log("PUT /users/:ID");
    const userID = req.params.ID;

    if (req.user.id !== parseInt(userID)) {
        return res.status(403).json({ message: "You can only update your own profile" });
    }

    let image = req.body.image || null;
    if (req.file) {
        image = `${req.protocol}://${req.get("host")}/uploads/${req.body.username}/${req.file.filename}`;
    }

    bcrypt.hash(req.body.password, 10, (err, hashedPassword) => {
        if (err) {
            return res.status(500).json({ message: "Error hashing password" });
        }

        const query = `
            UPDATE [dbo].[Users]
            SET
                [firstname] = @firstname,
                [lastname] = @lastname,
                [email] = @email,
                [birthdate] = @birthdate,
                [phonenumber] = @phonenumber,
                [about] = @about,
                [other] = @other,
                [calendar] = @calendar,
                [twitter] = @twitter,
                [bluesky] = @bluesky,
                [instagram] = @instagram,
                [facebook] = @facebook,
                [discord] = @discord,
                [snapchat] = @snapchat,
                [tiktok] = @tiktok,
                [threads] = @threads,
                [reddit] = @reddit,
                [twitch] = @twitch,
                [youtube] = @youtube,
                [vimeo] = @vimeo,
                [patreon] = @patreon,
                [kofi] = @kofi,
                [venmo] = @venmo,
                [paypal] = @paypal,
                [gofundme] = @gofundme,
                [extralife] = @extralife,
                [complete] = @complete,
                [inprogress] = @inprogress,
                [hashedpassword] = @hashedpassword,
                [image] = @image
            WHERE [ID] = @userID`;

        poolPromise.then(pool => {
            new sql.Request()
                .input("firstname", sql.VarChar, req.body.firstname || "")
                .input("lastname", sql.VarChar, req.body.lastname || "")
                .input("email", sql.VarChar, req.body.email || "")
                .input("birthdate", sql.Date, req.body.birthdate || "")
                .input("phonenumber", sql.VarChar, req.body.phonenumber || "")
                .input("about", sql.VarChar, req.body.about || "")
                .input("other", sql.VarChar, req.body.other || "")
                .input("calendar", sql.VarChar, req.body.calendar || "")
                .input("twitter", sql.VarChar, req.body.twitter || "")
                .input("bluesky", sql.VarChar, req.body.bluesky || "")
                .input("instagram", sql.VarChar, req.body.instagram || "")
                .input("facebook", sql.VarChar, req.body.facebook || "")
                .input("discord", sql.VarChar, req.body.discord || "")
                .input("snapchat", sql.VarChar, req.body.snapchat || "")
                .input("tiktok", sql.VarChar, req.body.tiktok || "")
                .input("threads", sql.VarChar, req.body.threads || "")
                .input("reddit", sql.VarChar, req.body.reddit || "")
                .input("twitch", sql.VarChar, req.body.twitch || "")
                .input("youtube", sql.VarChar, req.body.youtube || "")
                .input("vimeo", sql.VarChar, req.body.vimeo || "")
                .input("patreon", sql.VarChar, req.body.patreon || "")
                .input("kofi", sql.VarChar, req.body.kofi || "")
                .input("venmo", sql.VarChar, req.body.venmo || "")
                .input("paypal", sql.VarChar, req.body.paypal || "")
                .input("gofundme", sql.VarChar, req.body.gofundme || "")
                .input("extralife", sql.VarChar, req.body.extralife || "")
                .input("complete", sql.VarChar, req.body.complete || "")
                .input("inprogress", sql.VarChar, req.body.inprogress || "")
                .input("hashedpassword", sql.VarChar, hashedPassword)
                .input("image", sql.VarChar, image)
                .input("userID", sql.Int, userID)
                .query(query, (err, result) => {
                    if (err) {
                        console.log(err);
                        return res.status(500).json({ message: "Error updating user data" });
                    }
                    res.status(200).json({ message: "User updated successfully" });
                });
        });
    });
});

/*
 *   Delete a user
 */
router.delete("/:ID", (req, res) => {
    console.log("DELETE /users/:ID");
    const userId = req.params.ID;

    if (req.user.id !== parseInt(userId)) {
        return res.status(403).json({ message: "You can only delete your own account!" });
    }

    sql.query`DELETE FROM [dbo].[Users] WHERE [ID] = ${userId}`
        .then(result => {
            if (result.rowsAffected[0] === 0) {
                return res.status(404).json({ message: "User not found" });
            }
            return res.status(200).json({ message: "User account deleted successfully" });
        })
        .catch(err => {
            console.error("Error deleting user:", err);
            return res.status(500).json({ message: "Error deleting user", error: err });
        });
});

module.exports = router;
