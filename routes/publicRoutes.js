const express = require("express");
const fs = require("fs");
const path = require("path");
const db = require("../db");

const router = express.Router();

/** Social media crawlers that need pre-rendered OG tags */
const CRAWLER_AGENTS = /facebookexternalhit|Facebot|Twitterbot|LinkedInBot|WhatsApp|Slackbot|TelegramBot|Discordbot/i;

/** Prevent XSS in injected attribute values */
function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/*
* Get a single group by id or slug, with its full member list.
* Public — no auth required, same as the /public/:username route above.
*/
router.get("/group/:groupid", async (req, res) => {
    console.log("get public/group/:groupid");
    const identifier = req.params.groupid;

    if (!identifier) {
        return res.status(400).json({ message: "Invalid Group identifier." });
    }

    try {
        const isNumericId = /^\d+$/.test(identifier);
        const groupQuery = isNumericId
            ? "SELECT groupid, groupname, groupimage, groupcity, groupstate, groupwebsite FROM groups WHERE groupid = $1"
            : "SELECT groupid, groupname, groupimage, groupcity, groupstate, groupwebsite FROM groups WHERE LOWER(groupslug) = LOWER($1)";
        const groupResult = await db.query(groupQuery, [isNumericId ? parseInt(identifier, 10) : identifier]);

        if (groupResult.rows.length === 0) {
            return res.status(404).json({ message: "Group not found" });
        }

        const group = groupResult.rows[0];

        const membersResult = await db.query(
            `SELECT u.id, u.firstname, u.lastname, u.username, u.image
             FROM groupmembers gm
             JOIN users u ON u.id = gm.userid
             WHERE gm.groupid = $1
             ORDER BY u.username`,
            [group.groupid]
        );
        group.members = membersResult.rows;

        return res.status(200).json(group);
    } catch (err) {
        console.error("Error fetching public group:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
});


/*
* Get a single event by id or slug, with its full member list.
* Public — no auth required, same pattern as /group/:groupid above.
*/
router.get("/event/:eventid", async (req, res) => {
    console.log("get public/event/:eventid");
    const identifier = req.params.eventid;

    if (!identifier) {
        return res.status(400).json({ message: "Invalid Event identifier." });
    }

    try {
        const isNumericId = /^\d+$/.test(identifier);
        const eventQuery = isNumericId
            ? "SELECT eventid, eventname, eventimage, eventcity, eventstate, eventwebsite, eventslug, eventownerid FROM events WHERE eventid = $1"
            : "SELECT eventid, eventname, eventimage, eventcity, eventstate, eventwebsite, eventslug, eventownerid FROM events WHERE LOWER(eventslug) = LOWER($1)";
        const eventResult = await db.query(eventQuery, [isNumericId ? parseInt(identifier, 10) : identifier]);

        if (eventResult.rows.length === 0) {
            return res.status(404).json({ message: "Event not found" });
        }

        const event = eventResult.rows[0];

        const membersResult = await db.query(
            `SELECT u.id, u.firstname, u.lastname, u.username, u.image
             FROM eventmembers em
             JOIN users u ON u.id = em.userid
             WHERE em.eventid = $1
             ORDER BY u.username`,
            [event.eventid]
        );
        event.members = membersResult.rows;

        return res.status(200).json(event);
    } catch (err) {
        console.error("Error fetching public event:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
});


/*
* Get a single user by username.
* - Social crawlers (Facebook, etc.) receive HTML with dynamic OG tags injected.
* - All other requests receive the normal JSON response.
*/
router.get("/:username", async (req, res) => {
    console.log("get public/username");

    const username = req.params.username;
    const query = `SELECT id, firstname, lastname, username, about, imawhat, email, phonenumber, image, twitter, bluesky, instagram, facebook, discord, 
               snapchat, tiktok, threads, reddit, twitch, youtube, vimeo, patreon, kofi, venmo, cashapp, paypal, gofundme, extralife, etsy, calendar, 
               complete, inprogress, cosplaygroup, website, website1, website2, website3, onlyfans
               FROM users WHERE LOWER(username) = LOWER($1)`;

    if (!db || !db.query) {
        console.error("Database connection is not available.");
        return res.status(500).json({ message: "Database connection is not available" });
    }

    try {
        const result = await db.query(query, [username]);
        const rows = result.rows;

        if (rows.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        const user = rows[0];

        // Fetch this user's group memberships. Wrapped separately so a problem
        // here (e.g. the groupmembers table not existing yet) can't take down
        // the rest of the profile.
        user.groups = [];
        try {
            const groupsResult = await db.query(
                `SELECT g.groupid, g.groupname, g.groupimage, g.groupwebsite
                 FROM groupmembers gm
                 JOIN groups g ON g.groupid = gm.groupid
                 JOIN users u ON u.id = gm.userid
                 WHERE LOWER(u.username) = LOWER($1)
                 ORDER BY g.groupname`,
                [username]
            );
            user.groups = groupsResult.rows;
        } catch (groupErr) {
            console.error("Error fetching user's groups:", groupErr);
        }

        user.events = [];
        try {
            const eventsResult = await db.query(
                `SELECT e.eventid, e.eventname, e.eventimage, e.eventwebsite, e.eventslug
                FROM eventmembers em
                JOIN events e ON e.eventid = em.eventid
                JOIN users u ON u.id = em.userid
                WHERE LOWER(u.username) = LOWER($1)
                ORDER BY e.eventname`,
                [username]
            );
            user.events = eventsResult.rows;
        } catch (groupErr) {
            console.error("Error fetching user's events:", groupErr);
        }

        // Fetch this user's guestbook entries, newest first. Wrapped separately
        // so a problem here (e.g. the guestbook table not existing yet) can't
        // take down the rest of the profile — same pattern as groups above.
        user.guestbook = [];
        try {
            const guestbookResult = await db.query(
                `SELECT gb.id, gb.message, gb.createdat, gb.authoruserid AS authorid,
                        au.username AS authorusername, au.image AS authorimage
                 FROM guestbook gb
                 JOIN users au ON au.id = gb.authoruserid
                 WHERE gb.profileuserid = $1
                 ORDER BY gb.createdat DESC`,
                [user.id]
            );
            user.guestbook = guestbookResult.rows;
        } catch (guestbookErr) {
            console.error("Error fetching user's guestbook:", guestbookErr);
        }

        // Serve OG-injected HTML to social crawlers; JSON to everyone else
        const userAgent = req.headers["user-agent"] || "";
        if (CRAWLER_AGENTS.test(userAgent)) {
            const indexPath = path.resolve(__dirname, "../build/index.html");
            let html;
            try {
                html = fs.readFileSync(indexPath, "utf8");
            } catch (err) {
                console.error("[OG] Could not read index.html:", err);
                return res.status(200).json(user); // Fall back to JSON if build missing
            }

            const displayName = [user.firstname, user.lastname].filter(Boolean).join(" ") || user.username;
            const profileUrl  = `https://midwestcosplay.club/public/${encodeURIComponent(user.username)}`;
            const title       = `${displayName} — Midwest Cosplay Club`;
            const description = user.about
                ? user.about.slice(0, 200)
                : `Check out ${displayName}'s cosplay profile on Midwest Cosplay Club!`;
            const image = user.image || "https://midwestcosplay.club/preview-image.jpg";

            const dynamicTags = `
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${escapeHtml(image)}" />
    <meta property="og:url" content="${escapeHtml(profileUrl)}" />
    <meta property="og:type" content="profile" />
    <meta property="profile:username" content="${escapeHtml(user.username)}" />
    <title>${escapeHtml(title)}</title>`;

            const injected = html
                .replace(/<meta property="og:title"[^>]*\/?>/g, "")
                .replace(/<meta property="og:description"[^>]*\/?>/g, "")
                .replace(/<meta property="og:image"[^>]*\/?>/g, "")
                .replace(/<meta property="og:url"[^>]*\/?>/g, "")
                .replace(/<meta property="og:type"[^>]*\/?>/g, "")
                .replace(/<title>.*?<\/title>/, "")
                .replace("</head>", `${dynamicTags}\n  </head>`);

            res.setHeader("Content-Type", "text/html");
            return res.send(injected);
        }

        return res.status(200).json(user);
    } catch (err) {
        console.error("Error fetching user:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
});


module.exports = router;