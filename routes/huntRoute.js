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

const upload = multer({ storage: multer.memoryStorage() }).single("image");

/*
 * The Planet Anime scavenger hunt task list. This is a fixed, hand-edited
 * array rather than a DB table since the hunt itself doesn't change often.
 *
 * Edit titles/descriptions/requiresimage/requirestext freely. DO NOT change
 * or reuse an `id` once players may have started completing tasks with it —
 * id is the foreign key into the huntprogress table. Add a new item with a
 * new id instead of renaming an old one's id.
 *
 * requiresimage: task isn't complete until a photo is attached.
 * requirestext: task isn't complete until a written answer is saved.
 * A task can require both, either, or neither (neither = plain checkbox).
 */
const HUNT_ITEMS = [
  {
    id: "storefront-photo",
    title: "Find the Planet Anime mascot",
    description: "Snap a photo of yourself with the Planet Anime mascot.",
    requiresimage: true,
    requirestext: false,
  },
  {
    id: "figure-shelf",
    title: "Spot the figure display",
    description: "Find the collectible figure display wall and check in here.",
    requiresimage: false,
    requirestext: false,
  },
  {
    id: "manga-volume-1",
    title: "Locate a Volume 1",
    description: "Find any manga series' Volume 1 on the shelves and photograph the cover.",
    requiresimage: true,
    requirestext: false,
  },
  {
    id: "staff-recommendation",
    title: "Get a staff recommendation",
    description: "Ask a staff member for their favorite anime/manga recommendation, and jot it down below.",
    requiresimage: false,
    requirestext: true,
    textprompt: "What did they recommend?",
  },
  {
    id: "mystery-item",
    title: "Find the mystery item",
    description: "Ask staff for this event's hidden \"mystery item\", then photograph it and tell us what it is.",
    requiresimage: true,
    requirestext: true,
    textprompt: "What was the mystery item?",
  },
];
// TODO: replace these placeholder tasks with your real Planet Anime hunt list.

/*
 * Upload a single file buffer (from multer) to Cloudinary and return its
 * secure URL. public_id is scoped per-user-per-task so re-uploads for the
 * same task overwrite the old photo instead of piling up.
 */
function uploadToCloudinary(fileBuffer, publicId) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: 'midwest-cosplay/hunt', public_id: publicId },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    ).end(fileBuffer);
  });
}

/*
 * Get the full hunt task list merged with the logged-in user's progress.
 */
router.get("/", async (req, res) => {
  console.log("GET /hunt - userid:", req.user.id);
  try {
    const result = await db.query(
      "SELECT itemid, completed, imageurl, textresponse, completedat FROM huntprogress WHERE userid = $1",
      [req.user.id]
    );

    const progressByItem = Object.fromEntries(
      result.rows.map((row) => [row.itemid, row])
    );

    const items = HUNT_ITEMS.map((item) => {
      const progress = progressByItem[item.id];
      return {
        ...item,
        completed: progress?.completed || false,
        imageurl: progress?.imageurl || null,
        textresponse: progress?.textresponse || "",
        completedat: progress?.completedat || null,
      };
    });

    const completedCount = items.filter((i) => i.completed).length;

    return res.status(200).json({ items, completedCount, totalCount: items.length });
  } catch (err) {
    console.error("Error fetching hunt progress:", err);
    return res.status(500).json({ message: "Error fetching hunt progress", error: err.message });
  }
});

/*
 * Mark a task complete, optionally attaching/replacing a photo and/or a
 * text answer. Upserts, so this also works to save a fresh photo or edited
 * answer for an already-completed task.
 */
router.post("/:itemid/complete", (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(500).json({ message: "Upload error", error: err.message });

    const itemId = req.params.itemid;
    const item = HUNT_ITEMS.find((i) => i.id === itemId);
    if (!item) {
      return res.status(404).json({ message: "Unknown hunt task." });
    }

    const submittedText = typeof req.body.textresponse === "string"
      ? req.body.textresponse.trim()
      : "";

    try {
      const existingResult = await db.query(
        "SELECT imageurl, textresponse FROM huntprogress WHERE userid = $1 AND itemid = $2",
        [req.user.id, itemId]
      );
      const existing = existingResult.rows[0] || null;

      // Save whatever was submitted this call, falling back to whatever was
      // already saved for the other field(s). A task like "mystery-item"
      // needs both a photo AND an answer, but those can arrive in separate
      // requests — save each as it comes in rather than rejecting one for
      // being submitted without the other.
      let imageUrl = existing?.imageurl || null;
      if (req.file) {
        imageUrl = await uploadToCloudinary(req.file.buffer, `${req.user.id}-${itemId}`);
      }

      const textResponse = submittedText || existing?.textresponse || null;

      // Only mark the task fully complete once every requirement it has is
      // satisfied. A partial save (e.g. photo only, on a task that also
      // needs text) is stored but left uncompleted until the rest comes in.
      const isComplete =
        (!item.requiresimage || !!imageUrl) &&
        (!item.requirestext || !!textResponse);

      const result = await db.query(
        `INSERT INTO huntprogress (userid, itemid, completed, imageurl, textresponse, completedat)
         VALUES ($1, $2, $3, $4, $5, CASE WHEN $3 THEN NOW() ELSE NULL END)
         ON CONFLICT (userid, itemid)
         DO UPDATE SET completed = $3,
                       imageurl = $4,
                       textresponse = $5,
                       completedat = CASE WHEN $3 THEN NOW() ELSE huntprogress.completedat END
         RETURNING itemid, completed, imageurl, textresponse, completedat`,
        [req.user.id, itemId, isComplete, imageUrl, textResponse]
      );

      return res.status(200).json({ message: "Task updated", progress: result.rows[0] });
    } catch (err) {
      console.error("Error saving hunt progress:", err);
      return res.status(500).json({ message: "Error saving hunt progress", error: err.message });
    }
  });
});

/*
 * Un-check a task. Any uploaded photo/answer is kept on file so the player
 * doesn't have to redo it if they just re-check the box.
 */
router.delete("/:itemid/complete", async (req, res) => {
  console.log("DELETE /hunt/:itemid/complete - userid:", req.user.id);
  const itemId = req.params.itemid;
  const item = HUNT_ITEMS.find((i) => i.id === itemId);
  if (!item) {
    return res.status(404).json({ message: "Unknown hunt task." });
  }

  try {
    await db.query(
      `UPDATE huntprogress SET completed = false WHERE userid = $1 AND itemid = $2`,
      [req.user.id, itemId]
    );
    return res.status(200).json({ message: "Task unchecked" });
  } catch (err) {
    console.error("Error clearing hunt progress:", err);
    return res.status(500).json({ message: "Error clearing hunt progress", error: err.message });
  }
});

module.exports = router;