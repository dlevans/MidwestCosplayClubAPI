const express = require("express");
const { sql } = require("../db");

const router = express.Router();


/*
*
*   Get a single user by username
*
*/
router.get("/:username", (req, res) => 
    {  
        console.log("get public/username");

        const username = req.params.username;

        sql.query`SELECT firstname, lastname, username, about, twitter, bluesky, instagram, facebook, discord, snapchat, tiktok, threads, reddit, twitch, youtube, vimeo, patreon, kofi, venmo, paypal, gofundme, extralife, calendar FROM [dbo].[Users] WHERE [username] = ${username}`
            .then(result => 
                {
                    if (result.recordset.length === 0) 
                        {
                            return res.status(404).json({ message: "User not found" });
                        }
                    res.status(200).json(result.recordset[0]); // Send the user as JSON
                })
            .catch(err => 
                {
                    console.error("Error fetching user:", err);
                    res.status(500).json({ message: "Error fetching user data", error: err });
                });
    });


module.exports = router;
