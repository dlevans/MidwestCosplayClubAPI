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
 * Edit titles/descriptions/requiresimage freely. DO NOT change or reuse an
 * `id` once players may have started completing tasks with it — id is the
 * foreign key into the huntprogress table (see migration below). Add a new
 * item with a new id instead of renaming an old one's id.
 */
const HUNT_ITEMS = [
  {
    id: "storefront-photo",
    title: "Find the Planet Anime storefront",
    description: "Snap a photo of yourself (or your cosplay!) outside the Planet Anime entrance.",
    requiresimage: true,
  },
  {
    id: "figure-shelf",
    title: "Spot the figure display",
    description: "Find the collectible figure display wall and check in here.",
    requiresimage: false,
  },
  {
    id: "manga-volume-1",
    title: "Locate a Volume 1",
    description: "Find any manga series' Volume 1 on the shelves and photograph the cover.",
    requiresimage: true,
  },
  {
    id: "staff-recommendation",
    title: "Get a staff recommendation",
    description: "Ask a staff member for their favorite anime/manga recommendation right now.",
    requiresimage: false,
  },
  {
    id: "mystery-item",
    title: "Find the mystery item",
    description: "Ask staff for this event's hidden \"mystery item\" and photograph it once you find it.",
    requiresimage: true,
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
      "SELECT itemid, completed, imageurl, completedat FROM huntprogress WHERE userid = $1",
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
 * Mark a task complete, optionally attaching/replacing a photo.
 * Upserts, so this also works to save a fresh photo for an already-
 * completed task (re-checking in doesn't require a new photo if one
 * was already uploaded).
 */
router.post("/:itemid/complete", (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(500).json({ message: "Upload error", error: err.message });

    const itemId = req.params.itemid;
    const item = HUNT_ITEMS.find((i) => i.id === itemId);
    if (!item) {
      return res.status(404).json({ message: "Unknown hunt task." });
    }

    try {
      let imageUrl = null;

      if (req.file) {
        imageUrl = await uploadToCloudinary(req.file.buffer, `${req.user.id}-${itemId}`);
      } else if (item.requiresimage) {
        // No new file on this request — allow re-checking only if a photo
        // was already saved on a previous attempt.
        const existing = await db.query(
          "SELECT imageurl FROM huntprogress WHERE userid = $1 AND itemid = $2",
          [req.user.id, itemId]
        );
        if (!existing.rows[0]?.imageurl) {
          return res.status(400).json({ message: "This task requires a photo." });
        }
        imageUrl = existing.rows[0].imageurl;
      }

      const result = await db.query(
        `INSERT INTO huntprogress (userid, itemid, completed, imageurl, completedat)
         VALUES ($1, $2, true, $3, NOW())
         ON CONFLICT (userid, itemid)
         DO UPDATE SET completed = true,
                       imageurl = COALESCE($3, huntprogress.imageurl),
                       completedat = NOW()
         RETURNING itemid, completed, imageurl, completedat`,
        [req.user.id, itemId, imageUrl]
      );

      return res.status(200).json({ message: "Task updated", progress: result.rows[0] });
    } catch (err) {
      console.error("Error saving hunt progress:", err);
      return res.status(500).json({ message: "Error saving hunt progress", error: err.message });
    }
  });
});

/*
 * Un-check a task. The uploaded photo (if any) is kept on file so the
 * player doesn't have to re-take it if they just re-check the box.
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