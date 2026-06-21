const express = require("express");
const cloudinary = require('cloudinary').v2;
const multer = require("multer");
const db = require("../db");
const authenticateJWT = require("../authMiddleware");

const router = express.Router();
router.use(authenticateJWT);

cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_NAME, 
  api_key: process.env.CLOUDINARY_API, 
  api_secret: process.env.CLOUDINARY_API_SECRET
});


const upload = multer({ storage: multer.memoryStorage() });


/*
 * Turn a group name into a URL-safe slug: lowercase, no spaces, no
 * punctuation. Existing hyphens in the name are preserved.
 */
function slugify(name) {
    return (name || "")
        .toString()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "") // strip accents (e.g. é -> e)
        .toLowerCase()
        .replace(/\s+/g, "") // remove all whitespace
        .replace(/[^a-z0-9-]/g, ""); // strip anything else that isn't URL-safe
}

/*
 * Slugs are looked up on the same route as numeric group IDs (see GET
 * /:groupid below), so a slug must never be all-digits or it would be
 * mistaken for an ID. Fall back to a "group-" prefix in that case.
 */
function ensureNonNumericSlug(base) {
    if (!base || /^\d+$/.test(base)) {
        return `group-${base || Date.now()}`;
    }
    return base;
}

/*
 * Generate a slug for groupname and make sure it's not already used by
 * another group, appending -2, -3, etc. on collision. Pass excludeGroupId
 * when updating a group so it doesn't collide with its own existing slug.
 */
async function generateUniqueSlug(groupname, excludeGroupId = null) {
    const base = ensureNonNumericSlug(slugify(groupname));
    let slug = base;
    let counter = 2;

    while (true) {
        const query = excludeGroupId
            ? "SELECT 1 FROM groups WHERE groupslug = $1 AND groupid != $2"
            : "SELECT 1 FROM groups WHERE groupslug = $1";
        const params = excludeGroupId ? [slug, excludeGroupId] : [slug];
        const result = await db.query(query, params);

        if (result.rows.length === 0) {
            return slug;
        }

        slug = `${base}-${counter}`;
        counter++;
    }
}


/*
 * Get all groups (With Pagination)
 */
router.get("/", async (req, res) => {
    console.log("GET all /groups");
    const { limit = 10, page = 1 } = req.query;

    const parsedLimit = parseInt(limit, 10);
    const parsedPage = parseInt(page, 10);
    const offset = (parsedPage - 1) * parsedLimit;

    try {
        const groupsQuery = `SELECT * FROM groups ORDER BY groupname ASC LIMIT $1 OFFSET $2`;
        const groupsResult = await db.query(groupsQuery, [parsedLimit, offset]);

        const countResult = await db.query("SELECT COUNT(*) AS total FROM groups");
        const totalGroups = parseInt(countResult.rows[0].total, 10);

        return res.status(200).json({
            groups: groupsResult.rows,
            total: totalGroups,
        });
    } catch (err) {
        console.error("Database query error:", err);
        return res.status(500).json({ message: "Error fetching data from database" });
    }
});


/*
 * Get all groups a user is a member of, via userid (for displaying on their site)
 * Note: this is membership, not ownership — see groupownerid for who can edit/delete.
 */
router.get("/user/:userid", async (req, res) => {
    console.log("GET /groups/user/:userid - userid:", req.params.userid);
    const userId = req.params.userid;

    if (!userId || isNaN(parseInt(userId))) {
        return res.status(400).json({ message: "Invalid User ID parameter." });
    }

    try {
        const query = `SELECT * FROM groups WHERE userid = $1 ORDER BY groupname ASC`;
        const result = await db.query(query, [parseInt(userId, 10)]);

        return res.status(200).json({ groups: result.rows });
    } catch (err) {
        console.error("Error fetching groups for user:", err);
        return res.status(500).json({ message: "Error fetching group data", error: err.message });
    }
});


/*
 * Get a single group by its numeric ID OR its slug.
 * Used to populate the Update form (by ID) and the public group page (by slug).
 */
router.get("/:groupid", async (req, res) => {
    console.log("GET /groups/:groupid - identifier requested:", req.params.groupid);
    const identifier = req.params.groupid;

    if (!identifier) {
        return res.status(400).json({ message: "Invalid Group identifier." });
    }

    try {
        const isNumericId = /^\d+$/.test(identifier);
        const query = isNumericId
            ? `SELECT * FROM groups WHERE groupid = $1`
            : `SELECT * FROM groups WHERE groupslug = $1`;
        const result = await db.query(query, [isNumericId ? parseInt(identifier, 10) : identifier]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Group not found" });
        }

        return res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error("Error fetching single group:", err);
        return res.status(500).json({ message: "Error fetching group data", error: err.message });
    }
});


/*
 * Create a new group (Member adding a group they're part of)
 */
router.post("/", upload.single("groupimage"), async (req, res) => {
    console.log("POST /groups - new group for user:", req.user.id);

    const { groupname, groupcity, groupstate, groupwebsite } = req.body;

    if (!groupname || !groupcity || !groupstate || !groupwebsite) {
        return res.status(400).json({ message: "groupname, groupcity, groupstate, and groupwebsite are required." });
    }

    try {
        let imageUrl = "";
        if (req.file) {
            const result = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream(
                    { folder: 'midwest-cosplay/groups' },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                ).end(req.file.buffer);
            });
            imageUrl = result.secure_url;
        }

        const groupslug = await generateUniqueSlug(groupname);

        const insertQuery = `
            INSERT INTO groups (userid, groupownerid, groupname, groupslug, groupimage, groupcity, groupstate, groupwebsite)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `;
        const values = [req.user.id, req.user.id, groupname, groupslug, imageUrl, groupcity, groupstate, groupwebsite];
        const result = await db.query(insertQuery, values);

        return res.status(201).json({ message: "Group created successfully", group: result.rows[0] });
    } catch (err) {
        console.error("Create group error:", err);
        return res.status(500).json({ message: "Error creating group", error: err.message });
    }
});


/*
 * Update an existing group (Owner only)
 */
router.put("/:groupid", upload.single("groupimage"), async (req, res) => {
    console.log("PUT /groups/:groupid");
    const groupID = req.params.groupid;

    if (!groupID || isNaN(parseInt(groupID))) {
        return res.status(400).json({ message: "Invalid Group ID." });
    }

    try {
        const existingGroupCheck = await db.query("SELECT groupownerid, groupimage, groupname, groupslug FROM groups WHERE groupid = $1", [groupID]);
        if (existingGroupCheck.rows.length === 0) return res.status(404).json({ message: "Group not found." });

        if (existingGroupCheck.rows[0].groupownerid !== req.user.id) {
            return res.status(403).json({ message: "Unauthorized: You can only update groups you own." });
        }

        let imageUrl = existingGroupCheck.rows[0].groupimage; // Keep old image by default
        if (req.file) {
            const result = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream(
                    { folder: 'midwest-cosplay/groups' },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                ).end(req.file.buffer);
            });
            imageUrl = result.secure_url;
        }

        const newGroupName = req.body.groupname || "";
        let groupslug = existingGroupCheck.rows[0].groupslug;

        // Only regenerate the slug when the name actually changes, so the
        // public URL doesn't shift on every save (e.g. just swapping a photo).
        if (newGroupName && newGroupName !== existingGroupCheck.rows[0].groupname) {
            groupslug = await generateUniqueSlug(newGroupName, groupID);
        }

        const updateFields = {
            groupname: newGroupName,
            groupslug: groupslug,
            groupcity: req.body.groupcity || "",
            groupstate: req.body.groupstate || "",
            groupwebsite: req.body.groupwebsite || "",
            groupimage: imageUrl || "",
        };

        const keys = Object.keys(updateFields);
        const values = Object.values(updateFields);
        const fields = keys.map((key, index) => `${key} = $${index + 1}`).join(", ");

        values.push(groupID);
        await db.query(`UPDATE groups SET ${fields} WHERE groupid = $${values.length}`, values);

        return res.status(200).json({ message: "Group updated successfully" });
    } catch (err) {
        console.error("Update group error:", err);
        return res.status(500).json({ message: "Error updating group", error: err.message });
    }
});


/*
 * Delete a group (Owner only)
 */
router.delete("/:groupid", async (req, res) => {
    console.log("DELETE /groups/:groupid");
    const groupID = req.params.groupid;

    if (!groupID || isNaN(parseInt(groupID))) {
        return res.status(400).json({ message: "Invalid Group ID." });
    }

    try {
        const existingGroupCheck = await db.query("SELECT groupownerid FROM groups WHERE groupid = $1", [groupID]);
        if (existingGroupCheck.rows.length === 0) return res.status(404).json({ message: "Group not found." });

        if (existingGroupCheck.rows[0].groupownerid !== req.user.id) {
            return res.status(403).json({ message: "Unauthorized: You can only delete groups you own." });
        }

        await db.query("DELETE FROM groups WHERE groupid = $1", [groupID]);

        return res.status(200).json({ message: "Group deleted successfully" });
    } catch (err) {
        console.error("Delete group error:", err);
        return res.status(500).json({ message: "Error deleting group", error: err.message });
    }
});


/*
 * Get all current members of a group
 */
router.get("/:groupid/members", async (req, res) => {
    console.log("GET /groups/:groupid/members");
    const groupID = req.params.groupid;

    if (!groupID || isNaN(parseInt(groupID))) {
        return res.status(400).json({ message: "Invalid Group ID." });
    }

    try {
        const query = `
            SELECT gm.groupmemberid, gm.userid, gm.addedat, u.firstname, u.lastname, u.username
            FROM groupmembers gm
            JOIN users u ON u.id = gm.userid
            WHERE gm.groupid = $1
            ORDER BY u.username
        `;
        const result = await db.query(query, [groupID]);

        return res.status(200).json({ members: result.rows });
    } catch (err) {
        console.error("Error fetching group members:", err);
        return res.status(500).json({ message: "Error fetching members", error: err.message });
    }
});


/*
 * Search users to add as members of a group (Owner only)
 * Excludes users who are already members of this group.
 */
router.get("/:groupid/members/search", async (req, res) => {
    console.log("GET /groups/:groupid/members/search");
    const groupID = req.params.groupid;
    const searchTerm = (req.query.q || "").trim();

    if (!groupID || isNaN(parseInt(groupID))) {
        return res.status(400).json({ message: "Invalid Group ID." });
    }

    if (!searchTerm) {
        return res.status(200).json({ users: [] });
    }

    try {
        const groupCheck = await db.query("SELECT groupownerid FROM groups WHERE groupid = $1", [groupID]);
        if (groupCheck.rows.length === 0) return res.status(404).json({ message: "Group not found." });

        if (groupCheck.rows[0].groupownerid !== req.user.id) {
            return res.status(403).json({ message: "Unauthorized: Only the group owner can search for members." });
        }

        const query = `
            SELECT id, firstname, lastname, username
            FROM users
            WHERE (firstname ILIKE $1 OR lastname ILIKE $1 OR username ILIKE $1)
              AND id NOT IN (
                  SELECT userid FROM groupmembers WHERE groupid = $2
              )
            ORDER BY username
            LIMIT 20
        `;
        const result = await db.query(query, [`%${searchTerm}%`, groupID]);

        return res.status(200).json({ users: result.rows });
    } catch (err) {
        console.error("Member search error:", err);
        return res.status(500).json({ message: "Error searching users", error: err.message });
    }
});


/*
 * Add a member to a group (Owner only)
 */
router.post("/:groupid/members", async (req, res) => {
    console.log("POST /groups/:groupid/members");
    const groupID = req.params.groupid;
    const { userid } = req.body;

    if (!groupID || isNaN(parseInt(groupID))) {
        return res.status(400).json({ message: "Invalid Group ID." });
    }

    if (!userid || isNaN(parseInt(userid))) {
        return res.status(400).json({ message: "A valid userid is required." });
    }

    try {
        const groupCheck = await db.query("SELECT groupownerid FROM groups WHERE groupid = $1", [groupID]);
        if (groupCheck.rows.length === 0) return res.status(404).json({ message: "Group not found." });

        if (groupCheck.rows[0].groupownerid !== req.user.id) {
            return res.status(403).json({ message: "Unauthorized: Only the group owner can add members." });
        }

        const insertQuery = `
            INSERT INTO groupmembers (groupid, userid)
            VALUES ($1, $2)
            RETURNING *
        `;
        const result = await db.query(insertQuery, [groupID, userid]);

        return res.status(201).json({ message: "Member added successfully", member: result.rows[0] });
    } catch (err) {
        if (err.code === "23505") {
            return res.status(409).json({ message: "This user is already a member of the group." });
        }
        console.error("Add member error:", err);
        return res.status(500).json({ message: "Error adding member", error: err.message });
    }
});


/*
 * Remove a member from a group (Owner only)
 */
router.delete("/:groupid/members/:userid", async (req, res) => {
    console.log("DELETE /groups/:groupid/members/:userid");
    const groupID = req.params.groupid;
    const memberUserID = req.params.userid;

    if (!groupID || isNaN(parseInt(groupID))) {
        return res.status(400).json({ message: "Invalid Group ID." });
    }
    if (!memberUserID || isNaN(parseInt(memberUserID))) {
        return res.status(400).json({ message: "Invalid User ID." });
    }

    try {
        const groupCheck = await db.query("SELECT groupownerid FROM groups WHERE groupid = $1", [groupID]);
        if (groupCheck.rows.length === 0) return res.status(404).json({ message: "Group not found." });

        if (groupCheck.rows[0].groupownerid !== req.user.id) {
            return res.status(403).json({ message: "Unauthorized: Only the group owner can remove members." });
        }

        await db.query("DELETE FROM groupmembers WHERE groupid = $1 AND userid = $2", [groupID, memberUserID]);

        return res.status(200).json({ message: "Member removed successfully" });
    } catch (err) {
        console.error("Remove member error:", err);
        return res.status(500).json({ message: "Error removing member", error: err.message });
    }
});


module.exports = router;