const express = require("express");
const pool = require("../db");
const authenticateJWT = require("../authMiddleware");

const router = express.Router();

/*
 * GET /templates
 * Paginated list of all templates, joined with the submitting user's
 * username and avatar. Mirrors GET /tutorials exactly.
 */
router.get("/", authenticateJWT, async (req, res) => {
  console.log("GET /templates");

  const page   = Math.max(1, parseInt(req.query.page,  10) || 1);
  const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const offset = (page - 1) * limit;

  try {
    const [templatesResult, countResult] = await Promise.all([
      pool.query(
        `SELECT
           t.templateid,
           t.templatetitle,
           t.templateurl,
           t.templatedescription,
           t.templatecategory,
           t.templateisfree,
           t.createdat,
           t.updatedat,
           t.userid,
           u.username,
           u.image AS useravatar
         FROM templates t
         JOIN users u ON u.id = t.userid
         ORDER BY t.createdat DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      pool.query("SELECT COUNT(*) FROM templates"),
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
 * Single template by id — used by the edit form.
 */
router.get("/:templateid", authenticateJWT, async (req, res) => {
  console.log("GET /templates/:templateid");

  const { templateid } = req.params;
  if (!/^\d+$/.test(templateid)) {
    return res.status(400).json({ message: "Invalid template id." });
  }

  try {
    const result = await pool.query(
      `SELECT
         t.templateid,
         t.templatetitle,
         t.templateurl,
         t.templatedescription,
         t.templatecategory,
         t.templateisfree,
         t.createdat,
         t.updatedat,
         t.userid,
         u.username,
         u.image AS useravatar
       FROM templates t
       JOIN users u ON u.id = t.userid
       WHERE t.templateid = $1`,
      [parseInt(templateid, 10)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Template not found." });
    }

    return res.status(200).json({ template: result.rows[0] });
  } catch (err) {
    console.error("Error fetching template:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/*
 * POST /templates
 * Creates a new template. userid always comes from the verified JWT.
 */
router.post("/", authenticateJWT, async (req, res) => {
  console.log("POST /templates");

  const { templatetitle, templateurl, templatedescription, templatecategory, templateisfree } = req.body;
  const userid = req.user.id;

  if (!templateurl || !templateurl.trim()) {
    return res.status(400).json({ message: "A template URL is required." });
  }
  if (!templatetitle || !templatetitle.trim()) {
    return res.status(400).json({ message: "A title is required." });
  }

  try {
    const parsed = new URL(templateurl.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return res.status(400).json({ message: "URL must start with http or https." });
    }
  } catch {
    return res.status(400).json({ message: "Please enter a valid URL." });
  }

  try {
    const result = await pool.query(
      `INSERT INTO templates
         (userid, templatetitle, templateurl, templatedescription, templatecategory, templateisfree)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING templateid`,
      [
        userid,
        templatetitle.trim().slice(0, 120),
        templateurl.trim(),
        (templatedescription || "").trim().slice(0, 500) || null,
        (templatecategory || "").trim() || null,
        templateisfree !== false, // default true if omitted
      ]
    );

    return res.status(201).json({
      message:    "Template added.",
      templateid: result.rows[0].templateid,
    });
  } catch (err) {
    console.error("Error creating template:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/*
 * PUT /templates/:templateid
 * Updates a template. Ownership enforced via JWT userid.
 */
router.put("/:templateid", authenticateJWT, async (req, res) => {
  console.log("PUT /templates/:templateid");

  const { templateid } = req.params;
  if (!/^\d+$/.test(templateid)) {
    return res.status(400).json({ message: "Invalid template id." });
  }

  const { templatetitle, templateurl, templatedescription, templatecategory, templateisfree } = req.body;
  const userid = req.user.id;

  if (!templateurl || !templateurl.trim()) {
    return res.status(400).json({ message: "A template URL is required." });
  }
  if (!templatetitle || !templatetitle.trim()) {
    return res.status(400).json({ message: "A title is required." });
  }

  try {
    const parsed = new URL(templateurl.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return res.status(400).json({ message: "URL must start with http or https." });
    }
  } catch {
    return res.status(400).json({ message: "Please enter a valid URL." });
  }

  try {
    const existing = await pool.query(
      "SELECT userid FROM templates WHERE templateid = $1",
      [parseInt(templateid, 10)]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ message: "Template not found." });
    }
    if (existing.rows[0].userid !== userid) {
      return res.status(403).json({ message: "You can only edit your own templates." });
    }

    await pool.query(
      `UPDATE templates
       SET templatetitle       = $1,
           templateurl         = $2,
           templatedescription = $3,
           templatecategory    = $4,
           templateisfree      = $5,
           updatedat           = NOW()
       WHERE templateid = $6`,
      [
        templatetitle.trim().slice(0, 120),
        templateurl.trim(),
        (templatedescription || "").trim().slice(0, 500) || null,
        (templatecategory || "").trim() || null,
        templateisfree !== false,
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
 * Deletes a template. Ownership enforced via JWT userid.
 */
router.delete("/:templateid", authenticateJWT, async (req, res) => {
  console.log("DELETE /templates/:templateid");

  const { templateid } = req.params;
  if (!/^\d+$/.test(templateid)) {
    return res.status(400).json({ message: "Invalid template id." });
  }

  const userid = req.user.id;

  try {
    const existing = await pool.query(
      "SELECT userid FROM templates WHERE templateid = $1",
      [parseInt(templateid, 10)]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ message: "Template not found." });
    }
    if (existing.rows[0].userid !== userid) {
      return res.status(403).json({ message: "You can only delete your own templates." });
    }

    await pool.query(
      "DELETE FROM templates WHERE templateid = $1",
      [parseInt(templateid, 10)]
    );

    return res.status(200).json({ message: "Template deleted." });
  } catch (err) {
    console.error("Error deleting template:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;