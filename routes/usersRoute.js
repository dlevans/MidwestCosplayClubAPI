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

// 2. DEFINE THE UPLOAD MIDDLEWARE
const upload = multer({ storage: multer.memoryStorage() });

/*
 * Update Profile Route
 */
router.put("/update/:id", upload.single("image"), async (req, res) => {
    console.log("PUT /update/:id");
    const userID = req.params.id; 

    if (!userID || isNaN(parseInt(userID))) {
        return res.status(400).json({ message: "Invalid User ID." });
    }

    try {
        const existingUserCheck = await db.query("SELECT birthdate, image FROM users WHERE id = $1", [userID]);
        if (existingUserCheck.rows.length === 0) return res.status(404).json({ message: "User not found." });

        // 3. Handle Cloudinary Upload
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

        // 4. Construct updateFields AFTER imageUrl is ready
        const updateFields = {
            firstname: req.body.firstname || "",
            lastname: req.body.lastname || "",
            birthdate: req.body.birthdate || existingUserCheck.rows[0].birthdate,
            username: req.body.username || "",
            about: req.body.about || "",
            // ... (keep all your other fields here) ...
            image: imageUrl,
            location: req.body.location || ""
        };

        if (req.body.password && req.body.password.trim() !== "") {
            updateFields.hashedpassword = await bcrypt.hash(req.body.password, 10);
        }

        // 5. Build dynamic query
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