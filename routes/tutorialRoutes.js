const express = require("express");
const pool = require("../db");
const authenticateJWT = require("../middleware/authMiddleware");

const router = express.Router();

/*
 * GET /tutorials
 * Returns a paginated list of all tutorials, joined with the submitting
 * user's username and avatar so the frontend cards can display them.
 * Requires auth (matches the groups route pattern).
 */
router.get("/", authenticateJWT, async (req, res) => {
  console.log("GET /tutorials");

  const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const offset = (page - 1) * limit;

  try {
    const [tutorialsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT
           t.tutorialid,
           t.tutorialtitle,
           t.tutorialurl,
           t.tutorialdescription,
           t.tutorialcategory,
           t.createdat,
           t.updatedat,
           t.userid,
           u.username,
           u.image  AS useravatar,
           u.username AS userslug
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
      total: parseInt(countResult.rows[0].count, 10),
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
 * Returns a single tutorial by id — used by the edit form to pre-populate
 * fields. Only the owner needs this, but auth is enough; no ownership check
 * required here since the form enforces it visually.
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
         t.tutorialid,
         t.tutorialtitle,
         t.tutorialurl,
         t.tutorialdescription,
         t.tutorialcategory,
         t.createdat,
         t.updatedat,
         t.userid,
         u.username,
         u.image  AS useravatar
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
 * Creates a new tutorial. The userid is taken from the verified JWT — never
 * trusted from the request body — so a user can only submit as themselves.
 */
router.post("/", authenticateJWT, async (req, res) => {
  console.log("POST /tutorials");

  const { tutorialtitle, tutorialurl, tutorialdescription, tutorialcategory } = req.body;
  const userid = req.user.id;

  if (!tutorialurl || !tutorialurl.trim()) {
    return res.status(400).json({ message: "A tutorial URL is required." });
  }
  if (!tutorialtitle || !tutorialtitle.trim()) {
    return res.status(400).json({ message: "A title is required." });
  }

  // Basic URL sanity check — must be http(s)
  try {
    const parsed = new URL(tutorialurl.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return res.status(400).json({ message: "URL must start with http or https." });
    }
  } catch {
    return res.status(400).json({ message: "Please enter a valid URL." });
  }

  try {
    const result = await pool.query(
      `INSERT INTO tutorials
         (userid, tutorialtitle, tutorialurl, tutorialdescription, tutorialcategory)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING tutorialid`,
      [
        userid,
        tutorialtitle.trim().slice(0, 120),
        tutorialurl.trim(),
        (tutorialdescription || "").trim().slice(0, 500) || null,
        (tutorialcategory || "").trim() || null,
      ]
    );

    return res.status(201).json({
      message: "Tutorial added.",
      tutorialid: result.rows[0].tutorialid,
    });
  } catch (err) {
    console.error("Error creating tutorial:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/*
 * PUT /tutorials/:tutorialid
 * Updates an existing tutorial. Ownership is enforced: the JWT userid must
 * match the tutorial's userid or the request is rejected with 403.
 */
router.put("/:tutorialid", authenticateJWT, async (req, res) => {
  console.log("PUT /tutorials/:tutorialid");

  const { tutorialid } = req.params;
  if (!/^\d+$/.test(tutorialid)) {
    return res.status(400).json({ message: "Invalid tutorial id." });
  }

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

  try {
    // Fetch first to check ownership
    const existing = await pool.query(
      "SELECT userid FROM tutorials WHERE tutorialid = $1",
      [parseInt(tutorialid, 10)]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ message: "Tutorial not found." });
    }
    if (existing.rows[0].userid !== userid) {
      return res.status(403).json({ message: "You can only edit your own tutorials." });
    }

    await pool.query(
      `UPDATE tutorials
       SET tutorialtitle       = $1,
           tutorialurl         = $2,
           tutorialdescription = $3,
           tutorialcategory    = $4,
           updatedat           = NOW()
       WHERE tutorialid = $5`,
      [
        tutorialtitle.trim().slice(0, 120),
        tutorialurl.trim(),
        (tutorialdescription || "").trim().slice(0, 500) || null,
        (tutorialcategory || "").trim() || null,
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
 * Deletes a tutorial. Same ownership check as PUT — JWT userid must match.
 */
router.delete("/:tutorialid", authenticateJWT, async (req, res) => {
  console.log("DELETE /tutorials/:tutorialid");

  const { tutorialid } = req.params;
  if (!/^\d+$/.test(tutorialid)) {
    return res.status(400).json({ message: "Invalid tutorial id." });
  }

  const userid = req.user.id;

  try {
    const existing = await pool.query(
      "SELECT userid FROM tutorials WHERE tutorialid = $1",
      [parseInt(tutorialid, 10)]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ message: "Tutorial not found." });
    }
    if (existing.rows[0].userid !== userid) {
      return res.status(403).json({ message: "You can only delete your own tutorials." });
    }

    await pool.query(
      "DELETE FROM tutorials WHERE tutorialid = $1",
      [parseInt(tutorialid, 10)]
    );

    return res.status(200).json({ message: "Tutorial deleted." });
  } catch (err) {
    console.error("Error deleting tutorial:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;