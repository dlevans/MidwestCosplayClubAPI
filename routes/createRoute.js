const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { sql } = require("../db");
const bcrypt = require("bcryptjs");

const router = express.Router();

// Set up multer storage with dynamic directory creation
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const username = req.body.username; // Get username from request body
        if (!username) {
            return cb(new Error("Username is required for file upload"), null);
        }

        const uploadFolder = path.join(__dirname, "../uploads", username);

        // Ensure the directory exists
        fs.mkdir(uploadFolder, { recursive: true }, (err) => {
            if (err) {
                return cb(err, null);
            }
            cb(null, uploadFolder);
        });
    },
    filename: (req, file, cb) => {
        // Use timestamp to avoid name conflicts
        const filename = Date.now() + path.extname(file.originalname);
        cb(null, filename);
    }
});

// Initialize multer with storage settings
const upload = multer({ storage: storage }).single("image");


/*
 *   Create a new user
 */
router.post("/", (req, res) => {
    upload(req, res, (err) => {
        if (err) {
            console.error("Error uploading file: ", err);
            return res.status(500).json({ message: "Error uploading file", error: err });
        }

        const { firstname, lastname, birthdate, username, password } = req.body;

        // Password validation regex
        const passwordRegex = /^(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        
        if (!passwordRegex.test(password)) {
            return res.status(400).json({ 
                message: "Password must be at least 8 characters long, contain at least one number, and one special character." 
            });
        }

        const checkQuery = "SELECT count(*) AS count FROM [dbo].[Users] WHERE username = @username";
        const request = new sql.Request();
        request.input("username", sql.NVarChar, username);

        request.query(checkQuery)
            .then(result => {
                if (result.recordset[0].count > 0) {
                    return res.status(409).json({ message: "Username already exists!!" });
                }

                // Proceed with hashing and inserting the user
                bcrypt.hash(password, 10, (err, hashedpassword) => {
                    if (err) {
                        console.error("Error hashing password: ", err);
                        return res.status(500).json({ message: "Error hashing password", error: err });
                    }

                    const imageUrl = req.file ? `${req.protocol}://${req.get("host")}/uploads/${username}/${req.file.filename}` : null;

                    const insertQuery = `
                        INSERT INTO [dbo].[Users] (firstname, lastname, birthdate, username, hashedpassword, image) 
                        VALUES (@firstname, @lastname, @birthdate, @username, @hashedpassword, @image)`;

                    request.input("firstname", sql.NVarChar, firstname);
                    request.input("lastname", sql.NVarChar, lastname);
                    request.input("birthdate", sql.Date, birthdate);
                    request.input("hashedpassword", sql.NVarChar, hashedpassword);
                    request.input("image", sql.NVarChar, imageUrl);

                    request.query(insertQuery)
                        .then(() => res.json("User added!"))
                        .catch(err => {
                            console.error("Error inserting user:", err.message || err);
                            res.status(500).json({ message: "Error inserting user into the database", error: err });
                        });
                });
            })
            .catch(err => {
                console.error("Error checking username:", err.message || err);
                res.status(500).json({ message: "Error checking username", error: err });
            });
    });
});



module.exports = router;
