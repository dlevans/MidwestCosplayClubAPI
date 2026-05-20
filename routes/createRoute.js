const express = require("express");
const cloudinary = require('cloudinary').v2;
const bcrypt = require("bcryptjs");
const pool = require("../db");

const router = express.Router();

// Cloudinary config
cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_NAME, 
  api_key: process.env.CLOUDINARY_API, 
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// FIX: Use memoryStorage instead of diskStorage to stop using local disk

router.post("/", async (req, res) => {
    upload(req, res, async (err) => {
        if (err) return res.status(500).json({ message: "Upload error", error: err });

        const { firstname, lastname, birthdate, username, password } = req.body;
        
        // ... (Keep your validation regex logic here) ...

        let imageUrl = null;
        if (req.file) {
            // FIX: Stream the buffer directly to Cloudinary
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

        try {
            const result = await pool.query(
                "INSERT INTO users (firstname, lastname, birthdate, username, hashedpassword, image) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
                [firstname, lastname, birthdate, username, hashedpassword, imageUrl]
            );
            res.json({ message: "User added!", userId: result.rows[0].id });
        } catch (error) {
            res.status(500).json({ message: "Database error", error });
        }
    });
});