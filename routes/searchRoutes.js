const express = require("express");
const db = require("../db");

const router = express.Router();

/*
 *   Search usersby completion status or in-progress status
 */
router.get("/", async (req, res) => {
    try {
        const searchQuery = req.query.query; // Get the query parameter
        
        console.log("GET /search", searchQuery);

        // Define the SQL query with wildcard search
        const sqlQuery = `
            SELECT ID, firstname, lastname, username, imawhat, etsy, complete, inprogress, cosplaygroup, image FROM usersWHERE complete LIKE $1 OR inprogress LIKE $2 OR firstname LIKE $3 OR lastname LIKE $4 OR username LIKE $5 OR cosplaygroup LIKE $6 OR imawhat LIKE $7`;

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
