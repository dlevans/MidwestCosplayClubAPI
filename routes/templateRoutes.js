const express         = require("express");
const cloudinary      = require("cloudinary").v2;
const multer          = require("multer");
const pool            = require("../db");
const authenticateJWT = require("../authMiddleware");

const router = express.Router();

// Same Cloudinary config as createRoute.js
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key:    process.env.CLOUDINARY_API,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Memory storage — buffer piped directly to Cloudinary
const upload = multer({ storage: multer.memoryStorage() });

/*
 * Upload a buffer to Cloudinary and return the secure URL.
 * Mirrors the upload_stream pattern in createRoute.js exactly.
 */
const saveImage = (buffer, folder, publicId) =>
  new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder, public_id: publicId }, (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      })
      .end(buffer);
  });

/*
 * GET /templates
 * Paginated list with server-side filtering.
 * Supported query params: search, category, creator, free, page, limit
 */
router.get("/", async (req, res) => {
  console.log("GET /templates");

  const page     = Math.max(1, parseInt(req.query.page,  10) || 1);
  const limit    = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const offset   = (page - 1) * limit;
  const search   = (req.query.search   || "").trim();
  const category = (req.query.category || "").trim();
  const creator  = (req.query.creator  || "").trim();
  const freeOnly = req.query.free === "true";

  // Build WHERE clauses dynamically
  const conditions = [];
  const params     = [];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(t.templatetitle ILIKE $${params.length} OR t.templatedescription ILIKE $${params.length})`);
  }

  if (category) {
    params.push(category);
    conditions.push(`t.templatecategory = $${params.length}`);
  }

  if (creator) {
    params.push(`%${creator}%`);
    conditions.push(`u.username ILIKE $${params.length}`);
  }

  if (freeOnly) {
    conditions.push(`t.templateisfree = TRUE`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Pagination params come after filter params
  const filterParams = [...params];
  params.push(limit);
  const limitIdx  = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  try {
    const [templatesResult, countResult] = await Promise.all([
      pool.query(
        `SELECT
           t.templateid, t.templatetitle, t.templateurl,
           t.templatedescription, t.templatecategory,
           t.templateisfree, t.templateimage,
           t.createdat, t.updatedat, t.userid,
           u.username, u.image AS useravatar
         FROM templates t
         JOIN users u ON u.id = t.userid
         ${where}
         ORDER BY t.templatetitle ASC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        params
      ),
      pool.query(
        `SELECT COUNT(*) FROM templates t
         JOIN users u ON u.id = t.userid
         ${where}`,
        filterParams
      ),
    ]);

    return res.status(200).json({
      templates: templatesResult.rows,
      total:     parseInt(countResult.rows[0].count, 10),
      page,
      limit,
    });
  } catch (err) {
    console.error("Error fetching templates:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/*
 * GET /templates/:templateid
 */
router.get("/:templateid", async (req, res) => {
  console.log("GET /templates/:templateid");

  const { templateid } = req.params;
  if (!/^\d+$/.test(templateid)) return res.status(400).json({ message: "Invalid template id." });

  try {
    const result = await pool.query(
      `SELECT
         t.templateid, t.templatetitle, t.templateurl,
         t.templatedescription, t.templatecategory,
         t.templateisfree, t.templateimage,
         t.createdat, t.updatedat, t.userid,
         u.username, u.image AS useravatar
       FROM templates t
       JOIN users u ON u.id = t.userid
       WHERE t.templateid = $1`,
      [parseInt(templateid, 10)]
    );

    if (result.rows.length === 0) return res.status(404).json({ message: "Template not found." });
    return res.status(200).json({ template: result.rows[0] });
  } catch (err) {
    console.error("Error fetching template:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/*
 * POST /templates
 */
router.post("/", authenticateJWT, upload.single("templateimage"), async (req, res) => {
  console.log("POST /templates");

  const { templatetitle, templateurl, templatedescription, templatecategory, templateisfree } = req.body;
  const userid = req.user.id;

  if (!templateurl  || !templateurl.trim())  return res.status(400).json({ message: "A template URL is required." });
  if (!templatetitle || !templatetitle.trim()) return res.status(400).json({ message: "A title is required." });

  try {
    const parsed = new URL(templateurl.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) return res.status(400).json({ message: "URL must start with http or https." });
  } catch { return res.status(400).json({ message: "Please enter a valid URL." }); }

  let templateimage = null;
  if (req.file) {
    try {
      const publicId = `template-${userid}-${Date.now()}`;
      templateimage = await saveImage(req.file.buffer, "midwest-cosplay/templates", publicId);
    } catch (imgErr) {
      console.error("Image upload failed:", imgErr);
      return res.status(500).json({ message: "Image upload failed." });
    }
  }

  try {
    const result = await pool.query(
      `INSERT INTO templates
         (userid, templatetitle, templateurl, templatedescription, templatecategory, templateisfree, templateimage)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING templateid`,
      [
        userid,
        templatetitle.trim().slice(0, 120),
        templateurl.trim(),
        (templatedescription || "").trim().slice(0, 500) || null,
        (templatecategory    || "").trim() || null,
        templateisfree !== "false" && templateisfree !== false,
        templateimage,
      ]
    );

    return res.status(201).json({ message: "Template added.", templateid: result.rows[0].templateid });
  } catch (err) {
    console.error("Error creating template:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/*
 * PUT /templates/:templateid
 */
router.put("/:templateid", authenticateJWT, upload.single("templateimage"), async (req, res) => {
  console.log("PUT /templates/:templateid");

  const { templateid } = req.params;
  if (!/^\d+$/.test(templateid)) return res.status(400).json({ message: "Invalid template id." });

  const { templatetitle, templateurl, templatedescription, templatecategory, templateisfree } = req.body;
  const userid = req.user.id;

  if (!templateurl  || !templateurl.trim())  return res.status(400).json({ message: "A template URL is required." });
  if (!templatetitle || !templatetitle.trim()) return res.status(400).json({ message: "A title is required." });

  try {
    const parsed = new URL(templateurl.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) return res.status(400).json({ message: "URL must start with http or https." });
  } catch { return res.status(400).json({ message: "Please enter a valid URL." }); }

  try {
    const existing = await pool.query(
      "SELECT userid, templateimage FROM templates WHERE templateid = $1",
      [parseInt(templateid, 10)]
    );
    if (existing.rows.length === 0) return res.status(404).json({ message: "Template not found." });
    if (existing.rows[0].userid !== userid && !req.user.is_admin) return res.status(403).json({ message: "Not authorized." });

    let templateimage = existing.rows[0].templateimage;
    if (req.file) {
      try {
        const publicId = `template-${userid}-${Date.now()}`;
        templateimage = await saveImage(req.file.buffer, "midwest-cosplay/templates", publicId);
      } catch (imgErr) {
        console.error("Image upload failed:", imgErr);
        return res.status(500).json({ message: "Image upload failed." });
      }
    }

    await pool.query(
      `UPDATE templates
       SET templatetitle       = $1,
           templateurl         = $2,
           templatedescription = $3,
           templatecategory    = $4,
           templateisfree      = $5,
           templateimage       = $6,
           updatedat           = NOW()
       WHERE templateid = $7`,
      [
        templatetitle.trim().slice(0, 120),
        templateurl.trim(),
        (templatedescription || "").trim().slice(0, 500) || null,
        (templatecategory    || "").trim() || null,
        templateisfree !== "false" && templateisfree !== false,
        templateimage,
        parseInt(templateid, 10),
      ]
    );

    return res.status(200).json({ message: "Template updated." });
  } catch (err) {
    console.error("Error updating template:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/*
 * DELETE /templates/:templateid
 */
router.delete("/:templateid", authenticateJWT, async (req, res) => {
  console.log("DELETE /templates/:templateid");

  const { templateid } = req.params;
  if (!/^\d+$/.test(templateid)) return res.status(400).json({ message: "Invalid template id." });

  const userid = req.user.id;

  try {
    const existing = await pool.query(
      "SELECT userid FROM templates WHERE templateid = $1",
      [parseInt(templateid, 10)]
    );
    if (existing.rows.length === 0) return res.status(404).json({ message: "Template not found." });
    if (existing.rows[0].userid !== userid) return res.status(403).json({ message: "You can only delete your own templates." });

    await pool.query("DELETE FROM templates WHERE templateid = $1", [parseInt(templateid, 10)]);
    return res.status(200).json({ message: "Template deleted." });
  } catch (err) {
    console.error("Error deleting template:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;