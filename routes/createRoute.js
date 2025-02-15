const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const pool = require("../db"); // Import MySQL2 connection pool

const router = express.Router();

// Set up multer storage with dynamic directory creation
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const username = req.body.username;
        if (!username) {
            return cb(new Error("Username is required for file upload"), null);
        }

        const uploadFolder = path.join(__dirname, "../uploads", username);

        fs.mkdir(uploadFolder, { recursive: true }, (err) => {
            if (err) {
                return cb(err, null);
            }
            cb(null, uploadFolder);
        });
    },
    filename: (req, file, cb) => {
        const filename = Date.now() + path.extname(file.originalname);
        cb(null, filename);
    }
});

const upload = multer({ storage: storage }).single("image");

router.post("/", async (req, res) => {
    try {
        upload(req, res, async (err) => {
            if (err) {
                console.error("Error uploading file: ", err);
                return res.status(500).json({ message: "Error uploading file", error: err });
            }

            const { firstname, lastname, birthdate, username, password } = req.body;

            const passwordRegex = /^(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
            if (!passwordRegex.test(password)) {
                return res.status(400).json({
                    message: "Password must be at least 8 characters long, contain at least one number, and one special character."
                });
            }

            const usernameRegex = /^[A-Za-z0-9]+$/;

            if (!usernameRegex.test(username)) {
                return res.status(400).json({
                    message: "Username must only contain letters and numbers, without spaces or special characters."
                });
            }

            try {
                const [existingUser] = await pool.query("SELECT COUNT(*) AS count FROM Users WHERE username = ?", [username]);
                if (existingUser[0].count > 0) {
                    return res.status(409).json({ message: "Username already exists!!" });
                }

                const hashedpassword = await bcrypt.hash(password, 10);
                const imageUrl = req.file ? `${req.protocol}://${req.get("host")}/uploads/${username}/${req.file.filename}` : null;

                const [result] = await pool.query(
                    "INSERT INTO Users (firstname, lastname, birthdate, username, hashedpassword, image) VALUES (?, ?, ?, ?, ?, ?)",
                    [firstname, lastname, birthdate , username, hashedpassword, imageUrl]
                );

                res.json({ message: "User added!", userId: result.insertId });
            } catch (error) {
                console.error("Database error:", error);
                res.status(500).json({ message: "Error inserting user into the database", error });
            }
        });
    } catch (error) {
        console.error("Error processing request:", error);
        res.status(500).json({ message: "Error processing request", error });
    }
});

module.exports = router;
