const express = require("express");
const db = require("../db");

const router = express.Router();

/*
 *   Search users by completion status or in-progress status
 */
router.get("/", async (req, res) => {
    try {
        const searchQuery = req.query.query; // Get the query parameter
        
        console.log("GET /search", searchQuery);

        // Define the SQL query with wildcard search
        const sqlQuery = `
            SELECT ID, firstname, lastname, username, imawhat, etsy, complete, inprogress, cosplaygroup, image FROM Users WHERE complete LIKE ? OR inprogress LIKE ? OR firstname LIKE ? OR lastname LIKE ? OR username LIKE ? OR cosplaygroup LIKE ? OR imawhat LIKE ?`;

        // Verify db connection is available
        if (!db || !db.query) 
            {
                console.error("Database connection is not available.");
                return res.status(500).json({ message: "Database connection is not available" });
            }

        const wildcardQuery = `%${searchQuery}%`;

        // Execute the query with parameterized input
        const [results] = await db.query(sqlQuery, [
            wildcardQuery, wildcardQuery, wildcardQuery,
            wildcardQuery, wildcardQuery, wildcardQuery, 
            wildcardQuery
        ]);

        res.status(200).json(results); // Return the filtered results
    } catch (err) {
        console.error("Database query error:", err);
        res.status(500).json({ message: "Error fetching search results", error: err });
    }
});

module.exports = router;
