const express = require("express");
const db = require("../db");

const router = express.Router();

/*
 * Search users by completion status or in-progress status
 */
router.get("/", async (req, res) => {
    try {
        const searchQuery = req.query.query; 
        
        console.log("GET /search", searchQuery);

        // FIX: Aliased id AS "ID" for the frontend, changed table to lowercase 'users'
        const sqlQuery = `
            SELECT id AS "ID", firstname, lastname, username, imawhat, etsy, complete, inprogress, cosplaygroup, image 
            FROM users 
            WHERE complete LIKE $1 OR inprogress LIKE $2 OR firstname LIKE $3 OR lastname LIKE $4 OR username LIKE $5 OR cosplaygroup LIKE $6 OR imawhat LIKE $7`;

        if (!db || !db.query) {
            console.error("Database connection is not available.");
            return res.status(500).json({ message: "Database connection is not available" });
        }

        const wildcardQuery = `%${searchQuery}%`;

        // FIX: Removed brackets [] from query result capture
        const result = await db.query(sqlQuery, [
            wildcardQuery, wildcardQuery, wildcardQuery,
            wildcardQuery, wildcardQuery, wildcardQuery, 
            wildcardQuery
        ]);

        return res.status(200).json(result.rows); // Return the rows array natively
    } catch (err) {
        console.error("Database query error:", err);
        return res.status(500).json({ message: "Error fetching search results", error: err });
    }
});

module.exports = router;