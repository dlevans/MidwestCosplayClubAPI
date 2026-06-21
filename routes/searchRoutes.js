const express = require("express");
const db = require("../db");

const router = express.Router();

/*
 * Search users (by completion status, in-progress status, names, or roles)
 * and groups (by name) for a single query string.
 */
router.get("/", async (req, res) => {
    try {
        const searchQuery = req.query.query; 
        
        console.log("GET /search - Query Input:", searchQuery);

        // If the query parameter is empty, return empty results instantly
        if (!searchQuery || searchQuery.trim() === "") {
            return res.status(200).json({ users: [], groups: [] });
        }

        if (!db || !db.query) {
            console.error("Database connection is not available.");
            return res.status(500).json({ message: "Database connection is not available" });
        }

        // Trim whitespace from user input before building wildcard bounds
        const wildcardQuery = `%${searchQuery.trim()}%`;

        // FIX: Swapped LIKE to ILIKE for absolute case-insensitive comparisons across your text collections
        const usersQuery = `
            SELECT id, firstname, lastname, username, imawhat, etsy, complete, inprogress, cosplaygroup, image 
            FROM users 
            WHERE complete ILIKE $1 
               OR inprogress ILIKE $2 
               OR firstname ILIKE $3 
               OR lastname ILIKE $4 
               OR username ILIKE $5 
               OR cosplaygroup ILIKE $6 
               OR imawhat ILIKE $7`;

        const groupsQuery = `
            SELECT groupid, groupname, groupslug, groupimage, groupcity, groupstate, groupwebsite
            FROM groups
            WHERE groupname ILIKE $1`;

        const [usersResult, groupsResult] = await Promise.all([
            db.query(usersQuery, [
                wildcardQuery, wildcardQuery, wildcardQuery,
                wildcardQuery, wildcardQuery, wildcardQuery,
                wildcardQuery
            ]),
            db.query(groupsQuery, [wildcardQuery]),
        ]);

        console.log(`Search completed successfully. Found ${usersResult.rows.length} matching members and ${groupsResult.rows.length} matching groups.`);
        return res.status(200).json({ users: usersResult.rows, groups: groupsResult.rows });
    } catch (err) {
        console.error("Database query error inside GET /search:", err);
        return res.status(500).json({ message: "Error fetching search results", error: err.message });
    }
});

module.exports = router;