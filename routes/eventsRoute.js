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
 * Turn a event name into a URL-safe slug: lowercase, no spaces, no
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
 * Slugs are looked up on the same route as numeric event IDs (see GET
 * /:eventid below), so a slug must never be all-digits or it would be
 * mistaken for an ID. Fall back to a "event-" prefix in that case.
 */
function ensureNonNumericSlug(base) {
    if (!base || /^\d+$/.test(base)) {
        return `event-${base || Date.now()}`;
    }
    return base;
}

/*
 * Generate a slug for eventname and make sure it's not already used by
 * another event, appending -2, -3, etc. on collision. Pass excludeeventId
 * when updating a event so it doesn't collide with its own existing slug.
 */
async function generateUniqueSlug(eventname, excludeEventId = null) {
    const base = ensureNonNumericSlug(slugify(eventname));
    let slug = base;
    let counter = 2;

    while (true) {
        const query = excludeEventId
            ? "SELECT 1 FROM events WHERE eventslug = $1 AND eventid != $2"
            : "SELECT 1 FROM events WHERE eventslug = $1";
        const params = excludeEventId ? [slug, excludeEventId] : [slug];
        const result = await db.query(query, params);

        if (result.rows.length === 0) {
            return slug;
        }

        slug = `${base}-${counter}`;
        counter++;
    }
}


/*
 * Get all events (With Pagination)
 */
router.get("/", async (req, res) => {
    console.log("GET all /events");
    const { limit = 10, page = 1 } = req.query;

    const parsedLimit = parseInt(limit, 10);
    const parsedPage = parseInt(page, 10);
    const offset = (parsedPage - 1) * parsedLimit;

    try {
        const eventsQuery = `SELECT * FROM events ORDER BY eventname ASC LIMIT $1 OFFSET $2`;
        const eventsResult = await db.query(eventsQuery, [parsedLimit, offset]);

        const countResult = await db.query("SELECT COUNT(*) AS total FROM events");
        const totalEvents = parseInt(countResult.rows[0].total, 10);

        return res.status(200).json({
            events: eventsResult.rows,
            total: totalEvents,
        });
    } catch (err) {
        console.error("Database query error:", err);
        return res.status(500).json({ message: "Error fetching data from database" });
    }
});


/*
 * Get all events a user is a member of, via userid (for displaying on their site)
 * Note: this is membership, not ownership — see eventownerid for who can edit/delete.
 */
router.get("/user/:userid", async (req, res) => {
    console.log("GET /events/user/:userid - userid:", req.params.userid);
    const userId = req.params.userid;

    if (!userId || isNaN(parseInt(userId))) {
        return res.status(400).json({ message: "Invalid User ID parameter." });
    }

    try {
        const query = `SELECT * FROM events WHERE userid = $1 ORDER BY eventname ASC`;
        const result = await db.query(query, [parseInt(userId, 10)]);

        return res.status(200).json({ events: result.rows });
    } catch (err) {
        console.error("Error fetching events for user:", err);
        return res.status(500).json({ message: "Error fetching event data", error: err.message });
    }
});


/*
 * Check if a user is authorized to manage event members.
 * Returns true if the user is the event owner OR an authorized event admin.
 */
async function isEventAdminOrOwner(eventId, userId) {
    const query = `
        SELECT 1 FROM events g
        LEFT JOIN eventmembers gm ON g.eventid = gm.eventid AND gm.userid = $2
        WHERE g.eventid = $1 
          AND (g.eventownerid = $2 OR gm.is_admin = true)
    `;
    const result = await db.query(query, [eventId, userId]);
    return result.rows.length > 0;
}


/*
 * Create a new event (Member adding a event they're part of)
 */
router.post("/", upload.single("eventimage"), async (req, res) => {
    console.log("POST /events - new event for user:", req.user.id);

    const { eventname, eventcity, eventstate, eventwebsite } = req.body;

    if (!eventname || !eventcity || !eventstate || !eventwebsite) {
        return res.status(400).json({ message: "eventname, eventcity, eventstate, and eventwebsite are required." });
    }

    try {
        let imageUrl = "";
        if (req.file) {
            const result = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream(
                    { folder: 'midwest-cosplay/events' },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                ).end(req.file.buffer);
            });
            imageUrl = result.secure_url;
        }

        const eventslug = await generateUniqueSlug(eventname);

        const insertQuery = `
            INSERT INTO events (userid, eventownerid, eventname, eventslug, eventimage, eventcity, eventstate, eventwebsite)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `;
        const values = [req.user.id, req.user.id, eventname, eventslug, imageUrl, eventcity, eventstate, eventwebsite];
        const result = await db.query(insertQuery, values);

        return res.status(201).json({ message: "Event created successfully", event: result.rows[0] });
    } catch (err) {
        console.error("Create event error:", err);
        return res.status(500).json({ message: "Error creating event", error: err.message });
    }
});


/*
 * Update an existing event (Owner only)
 */
router.put("/:eventid", upload.single("eventimage"), async (req, res) => {
    console.log("PUT /events/:eventid");
    const eventID = req.params.eventid;

    if (!eventID || isNaN(parseInt(eventID))) {
        return res.status(400).json({ message: "Invalid Event ID." });
    }

    try {
        const existingEventCheck = await db.query("SELECT eventownerid, eventimage, eventname, eventslug FROM events WHERE eventid = $1", [eventID]);
        if (existingEventCheck.rows.length === 0) return res.status(404).json({ message: "Event not found." });

        if (existingEventCheck.rows[0].eventownerid !== req.user.id) {
            return res.status(403).json({ message: "Unauthorized: You can only update events you own." });
        }

        let imageUrl = existingEventCheck.rows[0].eventimage; // Keep old image by default
        if (req.file) {
            const result = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream(
                    { folder: 'midwest-cosplay/events' },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                ).end(req.file.buffer);
            });
            imageUrl = result.secure_url;
        }

        const newEventName = req.body.eventname || "";
        let eventslug = existingEventCheck.rows[0].eventslug;

        // Only regenerate the slug when the name actually changes, so the
        // public URL doesn't shift on every save (e.g. just swapping a photo).
        if (newEventName && newEventName !== existingEventCheck.rows[0].eventname) {
            eventslug = await generateUniqueSlug(newEventName, eventID);
        }

        const updateFields = {
            eventname: newEventName,
            eventslug: eventslug,
            eventcity: req.body.eventcity || "",
            eventstate: req.body.eventstate || "",
            eventwebsite: req.body.eventwebsite || "",
            eventimage: imageUrl || "",
        };

        const keys = Object.keys(updateFields);
        const values = Object.values(updateFields);
        const fields = keys.map((key, index) => `${key} = $${index + 1}`).join(", ");

        values.push(eventID);
        await db.query(`UPDATE events SET ${fields} WHERE eventid = $${values.length}`, values);

        return res.status(200).json({ message: "Event updated successfully" });
    } catch (err) {
        console.error("Update event error:", err);
        return res.status(500).json({ message: "Error updating event", error: err.message });
    }
});


/*
 * Delete a event (Owner only)
 */
router.delete("/:eventid", async (req, res) => {
    console.log("DELETE /events/:eventid");
    const eventID = req.params.eventid;

    if (!eventID || isNaN(parseInt(eventID))) {
        return res.status(400).json({ message: "Invalid Event ID." });
    }

    try {
        const existingEventCheck = await db.query("SELECT eventownerid FROM events WHERE eventid = $1", [eventID]);
        if (existingEventCheck.rows.length === 0) return res.status(404).json({ message: "Event not found." });

        if (existingEventCheck.rows[0].eventownerid !== req.user.id) {
            return res.status(403).json({ message: "Unauthorized: You can only delete events you own." });
        }

        await db.query("DELETE FROM events WHERE eventid = $1", [eventID]);

        return res.status(200).json({ message: "Event deleted successfully" });
    } catch (err) {
        console.error("Delete event error:", err);
        return res.status(500).json({ message: "Error deleting event", error: err.message });
    }
});


/*
 * Get all current members of a event
 */
router.get("/:eventid/members", async (req, res) => {
    console.log("GET /events/:eventid/members");
    const eventID = req.params.eventid;

    if (!eventID || isNaN(parseInt(eventID))) {
        return res.status(400).json({ message: "Invalid Event ID." });
    }

    try {
        const query = `
            SELECT gm.eventmemberid, gm.userid, gm.addedat, u.firstname, u.lastname, u.username
            FROM eventmembers gm
            JOIN users u ON u.id = gm.userid
            WHERE gm.eventid = $1
            ORDER BY u.username
        `;
        const result = await db.query(query, [eventID]);

        return res.status(200).json({ members: result.rows });
    } catch (err) {
        console.error("Error fetching event members:", err);
        return res.status(500).json({ message: "Error fetching members", error: err.message });
    }
});


/*
 * Search users to add as members of a event (Owner only)
 * Excludes users who are already members of this event.
 */
router.get("/:eventid/members/search", async (req, res) => {
    console.log("GET /events/:eventid/members/search");
    const eventID = req.params.eventid;
    const searchTerm = (req.query.q || "").trim();

    if (!eventID || isNaN(parseInt(eventID))) {
        return res.status(400).json({ message: "Invalid Event ID." });
    }

    if (!searchTerm) {
        return res.status(200).json({ users: [] });
    }

    try {
        const eventCheck = await db.query("SELECT eventownerid FROM events WHERE eventid = $1", [eventID]);
        if (eventCheck.rows.length === 0) return res.status(404).json({ message: "Event not found." });

        if (eventCheck.rows[0].eventownerid !== req.user.id) {
            return res.status(403).json({ message: "Unauthorized: Only the event owner can search for members." });
        }

        const query = `
            SELECT id, firstname, lastname, username
            FROM users
            WHERE (firstname ILIKE $1 OR lastname ILIKE $1 OR username ILIKE $1)
              AND id NOT IN (
                  SELECT userid FROM eventmembers WHERE eventid = $2
              )
            ORDER BY username
            LIMIT 20
        `;
        const result = await db.query(query, [`%${searchTerm}%`, eventID]);

        return res.status(200).json({ users: result.rows });
    } catch (err) {
        console.error("Member search error:", err);
        return res.status(500).json({ message: "Error searching users", error: err.message });
    }
});


/*
 * Add a member to a event (Owner only)
 */
router.post("/:eventid/members", async (req, res) => {
    console.log("POST /events/:eventid/members");
    const eventID = req.params.eventid;
    const { userid } = req.body;

    if (!eventID || isNaN(parseInt(eventID))) {
        return res.status(400).json({ message: "Invalid Event ID." });
    }

    if (!userid || isNaN(parseInt(userid))) {
        return res.status(400).json({ message: "A valid userid is required." });
    }

    try {
        const eventCheck = await db.query("SELECT eventownerid FROM events WHERE eventid = $1", [eventID]);
        if (eventCheck.rows.length === 0) return res.status(404).json({ message: "Event not found." });

        if (eventCheck.rows[0].eventownerid !== req.user.id) {
            return res.status(403).json({ message: "Unauthorized: Only the event owner can add members." });
        }

        const insertQuery = `
            INSERT INTO eventmembers (eventid, userid)
            VALUES ($1, $2)
            RETURNING *
        `;
        const result = await db.query(insertQuery, [eventID, userid]);

        return res.status(201).json({ message: "Member added successfully", member: result.rows[0] });
    } catch (err) {
        if (err.code === "23505") {
            return res.status(409).json({ message: "This user is already a member of the event." });
        }
        console.error("Add member error:", err);
        return res.status(500).json({ message: "Error adding member", error: err.message });
    }
});


/*
 * Remove a member from a event (Owner only)
 */
router.delete("/:eventid/members/:userid", async (req, res) => {
    console.log("DELETE /events/:eventid/members/:userid");
    const eventID = req.params.eventid;
    const memberUserID = req.params.userid;

    if (!eventID || isNaN(parseInt(eventID))) {
        return res.status(400).json({ message: "Invalid Event ID." });
    }
    if (!memberUserID || isNaN(parseInt(memberUserID))) {
        return res.status(400).json({ message: "Invalid User ID." });
    }

    try {
        const eventCheck = await db.query("SELECT eventownerid FROM events WHERE eventid = $1", [eventID]);
        if (eventCheck.rows.length === 0) return res.status(404).json({ message: "Event not found." });

        if (eventCheck.rows[0].eventownerid !== req.user.id) {
            return res.status(403).json({ message: "Unauthorized: Only the event owner can remove members." });
        }

        await db.query("DELETE FROM eventmembers WHERE eventid = $1 AND userid = $2", [eventID, memberUserID]);

        return res.status(200).json({ message: "Member removed successfully" });
    } catch (err) {
        console.error("Remove member error:", err);
        return res.status(500).json({ message: "Error removing member", error: err.message });
    }
});


/*
 * Get a single event by its numeric ID OR its slug.
 * Must be registered AFTER all /:eventid/members* routes so Express doesn't
 * swallow requests like /123/members/search by matching /:eventid first.
 */
router.get("/:eventid", async (req, res) => {
    console.log("GET /events/:eventid - identifier requested:", req.params.eventid);
    const identifier = req.params.eventid;

    if (!identifier) {
        return res.status(400).json({ message: "Invalid Event identifier." });
    }

    try {
        const isNumericId = /^\d+$/.test(identifier);
        const query = isNumericId
            ? `SELECT * FROM events WHERE eventid = $1`
            : `SELECT * FROM events WHERE eventslug = $1`;
        const result = await db.query(query, [isNumericId ? parseInt(identifier, 10) : identifier]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Event not found" });
        }

        return res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error("Error fetching single event:", err);
        return res.status(500).json({ message: "Error fetching event data", error: err.message });
    }
});


module.exports = router;