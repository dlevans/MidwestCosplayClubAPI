// routes/admin.js
const express = require("express");
const pool = require("../db");
const requireAdmin = require("../requireAdmin");
const router = express.Router();

// GET all admins
router.get("/admins", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, firstname, lastname, username FROM users WHERE is_admin = TRUE ORDER BY username"
    );
    res.json({ admins: result.rows });
  } catch (err) {
    res.status(500).json({ message: "Error fetching admins", error: err });
  }
});

// Search users to add as admin (reuses same pattern as group member search)
router.get("/admins/search", requireAdmin, async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ users: [] });

  try {
    const result = await pool.query(
      `SELECT id, firstname, lastname, username FROM users
       WHERE is_admin = FALSE AND (
         LOWER(username) LIKE LOWER($1) OR
         LOWER(firstname) LIKE LOWER($1) OR
         LOWER(lastname) LIKE LOWER($1)
       ) LIMIT 10`,
      [`%${q}%`]
    );
    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ message: "Error searching users", error: err });
  }
});

// Grant admin
router.post("/admins", requireAdmin, async (req, res) => {
  const { userid } = req.body;
  try {
    await pool.query("UPDATE users SET is_admin = TRUE WHERE id = $1", [userid]);
    res.json({ message: "Admin granted." });
  } catch (err) {
    res.status(500).json({ message: "Error granting admin", error: err });
  }
});

// Revoke admin (can't remove yourself)
router.delete("/admins/:userid", requireAdmin, async (req, res) => {
  if (parseInt(req.params.userid) === req.user.id) {
    return res.status(400).json({ message: "You can't remove your own admin access." });
  }
  try {
    await pool.query("UPDATE users SET is_admin = FALSE WHERE id = $1", [req.params.userid]);
    res.json({ message: "Admin revoked." });
  } catch (err) {
    res.status(500).json({ message: "Error revoking admin", error: err });
  }
});

module.exports = router;