const express = require("express");
const cloudinary = require('cloudinary').v2;
const bcrypt = require("bcryptjs");
const multer = require("multer"); // Ensure multer is imported
const pool = require("db");

const router = express.Router();

cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_NAME, 
  api_key: process.env.CLOUDINARY_API, 
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure multer to use memory storage
const upload = multer({ storage: multer.memoryStorage() }).single("image");

router.post("/", (req, res) => {
    upload(req, res, async (err) => {
        if (err) return res.status(500).json({ message: "Upload error", error: err });

        try {
            const { firstname, lastname, birthdate, username, password } = req.body;
            
            // ... (Add your existing regex validation logic here) ...

            let imageUrl = null;
            if (req.file) {
                const result = await new Promise((resolve, reject) => {
                    cloudinary.uploader.upload_stream(
                        { folder: 'midwest-cosplay', public_id: username },
                        (error, result) => {
                            if (error) reject(error);
                            else resolve(result);
                        }
                    ).end(req.file.buffer);
                });
                imageUrl = result.secure_url; 
            }

            const hashedpassword = await bcrypt.hash(password, 10);

            // Single insert logic
            const result = await pool.query(
                "INSERT INTO users (firstname, lastname, birthdate, username, hashedpassword, image) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
                [firstname, lastname, birthdate, username, hashedpassword, imageUrl]
            );

            res.json({ message: "User added!", userId: result.rows[0].id });
        } catch (error) {
            console.error("Database or Upload error:", error);
            res.status(500).json({ message: "Error processing request", error });
        }
    });
});

module.exports = router;