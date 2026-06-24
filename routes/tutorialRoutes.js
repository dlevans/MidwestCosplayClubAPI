const express    = require("express");
const pool       = require("../db");
const multer     = require("multer");
const authenticateJWT = require("../authMiddleware");

const router  = express.Router();

// Store uploads in memory — same pattern as user image upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith("image/"));
  },
});

/*
 * Utility: upload a buffer to wherever your app stores images.
 * Replace the body of this function with your actual storage call
 * (S3, Cloudinary, local disk, etc.). It must return a public URL string.
 * This mirrors how CreateUser.js handles image uploads.
 */
const saveImage = async (buffer, mimetype, filename) => {
  // ── Example: upload to S3 ──────────────────────────────────────────────
  // const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
  // const s3  = new S3Client({ region: process.env.AWS_REGION });
  // const key = `tutorials/${Date.now()}-${filename}`;
  // await s3.send(new PutObjectCommand({
  //   Bucket: process.env.S3_BUCKET, Key: key, Body: buffer, ContentType: mimetype,
  // }));
  // return `https://${process.env.S3_BUCKET}.s3.amazonaws.com/${key}`;

  // ── Placeholder — swap with your actual upload logic ──────────────────
  throw new Error("saveImage: plug in your storage provider here.");
};

/*
 * GET /tutorials
 * Paginated list, joined with the submitting user's avatar and username.
 */
router.get("/", authenticateJWT, async (req, res) => {
  console.log("GET /tutorials");

  const page   = Math.max(1, parseInt(req.query.page,  10) || 1);
  const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const offset = (page - 1) * limit;

  try {
    const [tutorialsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT
           t.tutorialid, t.tutorialtitle, t.tutorialurl,
           t.tutorialdescription, t.tutorialcategory,
           t.tutorialimage, t.createdat, t.updatedat, t.userid,
           u.username, u.image AS useravatar, u.username AS userslug
         FROM tutorials t
         JOIN users u ON u.id = t.userid
         ORDER BY t.createdat DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      pool.query("SELECT COUNT(*) FROM tutorials"),
    ]);

    return res.status(200).json({
      tutorials: tutorialsResult.rows,
      total:     parseInt(countResult.rows[0].count, 10),
      page,
      limit,
    });
  } catch (err) {
    console.error("Error fetching tutorials:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/*
 * GET /tutorials/:tutorialid
 * Single tutorial — used by the edit form.
 */
router.get("/:tutorialid", authenticateJWT, async (req, res) => {
  console.log("GET /tutorials/:tutorialid");

  const { tutorialid } = req.params;
  if (!/^\d+$/.test(tutorialid)) {
    return res.status(400).json({ message: "Invalid tutorial id." });
  }

  try {
    const result = await pool.query(
      `SELECT
         t.tutorialid, t.tutorialtitle, t.tutorialurl,
         t.tutorialdescription, t.tutorialcategory,
         t.tutorialimage, t.createdat, t.updatedat, t.userid,
         u.username, u.image AS useravatar
       FROM tutorials t
       JOIN users u ON u.id = t.userid
       WHERE t.tutorialid = $1`,
      [parseInt(tutorialid, 10)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Tutorial not found." });
    }

    return res.status(200).json({ tutorial: result.rows[0] });
  } catch (err) {
    console.error("Error fetching tutorial:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/*
 * POST /tutorials
 * Creates a tutorial. Accepts multipart/form-data; image is optional.
 */
router.post("/", authenticateJWT, upload.single("tutorialimage"), async (req, res) => {
  console.log("POST /tutorials");

  const { tutorialtitle, tutorialurl, tutorialdescription, tutorialcategory } = req.body;
  const userid = req.user.id;

  if (!tutorialurl || !tutorialurl.trim()) {
    return res.status(400).json({ message: "A tutorial URL is required." });
  }
  if (!tutorialtitle || !tutorialtitle.trim()) {
    return res.status(400).json({ message: "A title is required." });
  }
  try {
    const parsed = new URL(tutorialurl.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return res.status(400).json({ message: "URL must start with http or https." });
    }
  } catch {
    return res.status(400).json({ message: "Please enter a valid URL." });
  }

  let tutorialimage = null;
  if (req.file) {
    try {
      tutorialimage = await saveImage(req.file.buffer, req.file.mimetype, req.file.originalname);
    } catch (imgErr) {
      console.error("Image upload failed:", imgErr);
      return res.status(500).json({ message: "Image upload failed." });
    }
  }

  try {
    const result = await pool.query(
      `INSERT INTO tutorials
         (userid, tutorialtitle, tutorialurl, tutorialdescription, tutorialcategory, tutorialimage)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING tutorialid`,
      [
        userid,
        tutorialtitle.trim().slice(0, 120),
        tutorialurl.trim(),
        (tutorialdescription || "").trim().slice(0, 500) || null,
        (tutorialcategory    || "").trim() || null,
        tutorialimage,
      ]
    );

    return res.status(201).json({
      message:    "Tutorial added.",
      tutorialid: result.rows[0].tutorialid,
    });
  } catch (err) {
    console.error("Error creating tutorial:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/*
 * PUT /tutorials/:tutorialid
 * Updates a tutorial. Ownership enforced. Image is optional — omitting it
 * keeps the existing thumbnail.
 */
router.put("/:tutorialid", authenticateJWT, upload.single("tutorialimage"), async (req, res) => {
  console.log("PUT /tutorials/:tutorialid");

  const { tutorialid } = req.params;
  if (!/^\d+$/.test(tutorialid)) {
    return res.status(400).json({ message: "Invalid tutorial id." });
  }

  const { tutorialtitle, tutorialurl, tutorialdescription, tutorialcategory } = req.body;
  const userid = req.user.id;

  if (!tutorialurl  || !tutorialurl.trim())  return res.status(400).json({ message: "A tutorial URL is required." });
  if (!tutorialtitle || !tutorialtitle.trim()) return res.status(400).json({ message: "A title is required." });

  try {
    const parsed = new URL(tutorialurl.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return res.status(400).json({ message: "URL must start with http or https." });
    }
  } catch {
    return res.status(400).json({ message: "Please enter a valid URL." });
  }

  try {
    const existing = await pool.query(
      "SELECT userid, tutorialimage FROM tutorials WHERE tutorialid = $1",
      [parseInt(tutorialid, 10)]
    );
    if (existing.rows.length === 0) return res.status(404).json({ message: "Tutorial not found." });
    if (existing.rows[0].userid !== userid) return res.status(403).json({ message: "You can only edit your own tutorials." });

    // Upload new image if provided, otherwise keep existing
    let tutorialimage = existing.rows[0].tutorialimage;
    if (req.file) {
      try {
        tutorialimage = await saveImage(req.file.buffer, req.file.mimetype, req.file.originalname);
      } catch (imgErr) {
        console.error("Image upload failed:", imgErr);
        return res.status(500).json({ message: "Image upload failed." });
      }
    }

    await pool.query(
      `UPDATE tutorials
       SET tutorialtitle       = $1,
           tutorialurl         = $2,
           tutorialdescription = $3,
           tutorialcategory    = $4,
           tutorialimage       = $5,
           updatedat           = NOW()
       WHERE tutorialid = $6`,
      [
        tutorialtitle.trim().slice(0, 120),
        tutorialurl.trim(),
        (tutorialdescription || "").trim().slice(0, 500) || null,
        (tutorialcategory    || "").trim() || null,
        tutorialimage,
        parseInt(tutorialid, 10),
      ]
    );

    return res.status(200).json({ message: "Tutorial updated." });
  } catch (err) {
    console.error("Error updating tutorial:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/*
 * DELETE /tutorials/:tutorialid
 * Ownership enforced.
 */
router.delete("/:tutorialid", authenticateJWT, async (req, res) => {
  console.log("DELETE /tutorials/:tutorialid");

  const { tutorialid } = req.params;
  if (!/^\d+$/.test(tutorialid)) return res.status(400).json({ message: "Invalid tutorial id." });

  const userid = req.user.id;

  try {
    const existing = await pool.query(
      "SELECT userid FROM tutorials WHERE tutorialid = $1",
      [parseInt(tutorialid, 10)]
    );
    if (existing.rows.length === 0) return res.status(404).json({ message: "Tutorial not found." });
    if (existing.rows[0].userid !== userid) return res.status(403).json({ message: "You can only delete your own tutorials." });

    await pool.query("DELETE FROM tutorials WHERE tutorialid = $1", [parseInt(tutorialid, 10)]);
    return res.status(200).json({ message: "Tutorial deleted." });
  } catch (err) {
    console.error("Error deleting tutorial:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;