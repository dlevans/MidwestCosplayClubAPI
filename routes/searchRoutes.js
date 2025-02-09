const express = require("express");
const { poolPromise } = require("../db");

const router = express.Router();

/*
 *   Search users by completion status or in-progress status
 */
router.get("/", async (req, res) => {
    try {
        const pool = await poolPromise;
        const searchQuery = req.query.query; // Get the query parameter
        
        console.log("GET /search", searchQuery);

        // Define the SQL query with wildcard search
        const sqlQuery = `
            SELECT ID, firstname, lastname, username, complete, inprogress, cosplaygroup, image
            FROM dbo.Users 
            WHERE complete LIKE @query OR inprogress LIKE @query OR firstname LIKE @query OR lastname LIKE @query OR username LIKE @query OR cosplaygroup LIKE @query
        `;

        // Execute the query with parameterized input
        const result = await pool
            .request()
            .input("query", `%${searchQuery}%`) // Use LIKE with wildcards
            .query(sqlQuery);

        res.status(200).json(result.recordset); // Return the filtered results
    } catch (err) {
        console.error("Database query error:", err);
        res.status(500).json({ message: "Error fetching search results", error: err });
    }
});

module.exports = router;