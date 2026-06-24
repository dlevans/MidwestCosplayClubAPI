const express = require("express");
const db = require("../db");

const router = express.Router();

/*
 * Search users, groups, and tutorials for a single query string.
 * All three run in parallel via Promise.all for speed.
 */
router.get("/", async (req, res) => {
    try {
        const searchQuery = req.query.query;

        console.log("GET /search - Query Input:", searchQuery);

        // If the query parameter is empty, return empty results instantly
        if (!searchQuery || searchQuery.trim() === "") {
            return res.status(200).json({ users: [], groups: [], tutorials: [] });
        }

        if (!db || !db.query) {
            console.error("Database connection is not available.");
            return res.status(500).json({ message: "Database connection is not available" });
        }

        // Trim whitespace from user input before building wildcard bounds
        const wildcardQuery = `%${searchQuery.trim()}%`;

        // ILIKE for case-insensitive matching across all three tables
        const usersQuery = `
            SELECT id, firstname, lastname, username, imawhat, etsy, complete, inprogress, cosplaygroup, image
            FROM users
            WHERE complete     ILIKE $1
               OR inprogress   ILIKE $2
               OR firstname    ILIKE $3
               OR lastname     ILIKE $4
               OR username     ILIKE $5
               OR cosplaygroup ILIKE $6
               OR imawhat      ILIKE $7`;

        const groupsQuery = `
            SELECT groupid, groupname, groupslug, groupimage, groupcity, groupstate, groupwebsite
            FROM groups
            WHERE groupname ILIKE $1`;

        const tutorialsQuery = `
            SELECT
                t.tutorialid,
                t.tutorialtitle,
                t.tutorialurl,
                t.tutorialdescription,
                t.tutorialcategory,
                t.userid,
                u.username,
                u.image AS useravatar
            FROM tutorials t
            JOIN users u ON u.id = t.userid
            WHERE t.tutorialtitle       ILIKE $1
               OR t.tutorialdescription ILIKE $2
               OR t.tutorialcategory    ILIKE $3
               OR u.username            ILIKE $4
            ORDER BY t.createdat DESC`;

        const [usersResult, groupsResult, tutorialsResult] = await Promise.all([
            db.query(usersQuery, [
                wildcardQuery, wildcardQuery, wildcardQuery,
                wildcardQuery, wildcardQuery, wildcardQuery,
                wildcardQuery,
            ]),
            db.query(groupsQuery, [wildcardQuery]),
            db.query(tutorialsQuery, [
                wildcardQuery, wildcardQuery, wildcardQuery, wildcardQuery,
            ]),
        ]);

        console.log(
            `Search completed. Found ${usersResult.rows.length} members, ` +
            `${groupsResult.rows.length} groups, ${tutorialsResult.rows.length} tutorials.`
        );

        return res.status(200).json({
            users:     usersResult.rows,
            groups:    groupsResult.rows,
            tutorials: tutorialsResult.rows,
        });
    } catch (err) {
        console.error("Database query error inside GET /search:", err);
        return res.status(500).json({ message: "Error fetching search results", error: err.message });
    }
});

module.exports = router;