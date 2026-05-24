const express = require("express");
const db = require("../..db");

const router = express.Router();

/*
 * Search users by completion status, in-progress status, names, or roles
 */
router.get("/", async (req, res) => {
    try {
        const searchQuery = req.query.query; 
        
        console.log("GET /search - Query Input:", searchQuery);

        // If the query parameter is empty, return an empty array instantly
        if (!searchQuery || searchQuery.trim() === "") {
            return res.status(200).json([]);
        }

        // FIX: Swapped LIKE to ILIKE for absolute case-insensitive comparisons across your text collections
        const sqlQuery = `
            SELECT id, firstname, lastname, username, imawhat, etsy, complete, inprogress, cosplaygroup, image 
            FROM users 
            WHERE complete ILIKE $1 
               OR inprogress ILIKE $2 
               OR firstname ILIKE $3 
               OR lastname ILIKE $4 
               OR username ILIKE $5 
               OR cosplaygroup ILIKE $6 
               OR imawhat ILIKE $7`;

        if (!db || !db.query) {
            console.error("Database connection is not available.");
            return res.status(500).json({ message: "Database connection is not available" });
        }

        // Trim whitespace from user input before building wildcard bounds
        const wildcardQuery = `%${searchQuery.trim()}%`;

        const result = await db.query(sqlQuery, [
            wildcardQuery, wildcardQuery, wildcardQuery,
            wildcardQuery, wildcardQuery, wildcardQuery, 
            wildcardQuery
        ]);

        console.log(`Search completed successfully. Found ${result.rows.length} matching members.`);
        return res.status(200).json(result.rows); 
    } catch (err) {
        console.error("Database query error inside GET /search:", err);
        return res.status(500).json({ message: "Error fetching search results", error: err.message });
    }
});

module.exports = router;