const express = require("express");
const cloudinary = require('cloudinary').v2;
const bcrypt = require("bcryptjs");
const multer = require("multer");
const pool = require("../db");

const router = express.Router();

cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_NAME, 
  api_key: process.env.CLOUDINARY_API, 
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Use memory storage so the buffer can be piped to Cloudinary
const upload = multer({ storage: multer.memoryStorage() }).single("image");

router.post("/", (req, res) => {
    upload(req, res, async (err) => {
        if (err) return res.status(500).json({ message: "Upload error", error: err });

        try {
            const { firstname, lastname, birthdate, username, password } = req.body;

            // Validate password
            const passwordRegex = /^(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
            if (!passwordRegex.test(password)) {
                return res.status(400).json({
                    message: "Password must be at least 8 characters long, contain at least one number, and one special character."
                });
            }

            // Validate username
            const usernameRegex = /^[A-Za-z0-9._]+$/;
            if (!usernameRegex.test(username)) {
                return res.status(400).json({
                    message: "Username must only contain letters, numbers, periods, and underscores."
                });
            }

            // Check for duplicate username
            const existingUserResult = await pool.query(
                "SELECT COUNT(*) AS count FROM users WHERE LOWER(username) = LOWER($1)",
                [username]
            );
            if (existingUserResult.rows[0].count > 0) {
                return res.status(409).json({ message: "Username already exists!!" });
            }

            // Upload image to Cloudinary if provided
            let imageUrl = null;
            if (req.file) {
                const uploadResult = await new Promise((resolve, reject) => {
                    cloudinary.uploader.upload_stream(
                        { folder: 'midwest-cosplay', public_id: username },
                        (error, result) => {
                            if (error) reject(error);
                            else resolve(result);
                        }
                    ).end(req.file.buffer);
                });
                imageUrl = uploadResult.secure_url;
            }

            const hashedpassword = await bcrypt.hash(password, 10);

            const result = await pool.query(
                "INSERT INTO users (firstname, lastname, birthdate, username, hashedpassword, image) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
                [firstname, lastname, birthdate, username, hashedpassword, imageUrl]
            );

            res.json({ message: "User added!", userId: result.rows[0].id });
        } catch (error) {
            console.error("Database or upload error:", error);
            res.status(500).json({ message: "Error processing request", error });
        }
    });
});

module.exports = router;