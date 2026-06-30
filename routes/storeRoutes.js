const express         = require("express");
const cloudinary      = require("cloudinary").v2;
const multer          = require("multer");
const pool            = require("../db");
const authenticateJWT = require("../authMiddleware");

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key:    process.env.CLOUDINARY_API,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ storage: multer.memoryStorage() });

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
 * ─── SQL schema (run once) ───────────────────────────────────────────────────
 *
 * CREATE TABLE stores (
 *   storeid          SERIAL PRIMARY KEY,
 *   userid           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 *   storename        VARCHAR(120) NOT NULL,
 *   storedescription VARCHAR(600),
 *   storetype        VARCHAR(60) NOT NULL DEFAULT 'Other',
 *   address          VARCHAR(200),
 *   city             VARCHAR(80),
 *   state            VARCHAR(60),
 *   zip              VARCHAR(10),
 *   phone            VARCHAR(30),
 *   website          VARCHAR(500),
 *   hours            VARCHAR(200),
 *   storeimage       VARCHAR(500),
 *   lat              NUMERIC(10, 7),
 *   lng              NUMERIC(10, 7),
 *   createdat        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *   updatedat        TIMESTAMPTZ NOT NULL DEFAULT NOW()
 * );
 *
 * CREATE INDEX idx_stores_state    ON stores (state);
 * CREATE INDEX idx_stores_city     ON stores (city);
 * CREATE INDEX idx_stores_type     ON stores (storetype);
 * CREATE INDEX idx_stores_userid   ON stores (userid);
 *
 * ─────────────────────────────────────────────────────────────────────────── */

/*
 * GET /stores
 * Paginated list with server-side filtering.
 * Query params: search, type (comma-separated), state (comma-separated),
 *               city, page, limit
 */
router.get("/", async (req, res) => {
  console.log("GET /stores");

  const page   = Math.max(1, parseInt(req.query.page,  10) || 1);
  const limit  = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const offset = (page - 1) * limit;
  const search = (req.query.search || "").trim();
  const city   = (req.query.city   || "").trim();

  const rawTypes  = Array.isArray(req.query.type)
    ? req.query.type
    : (req.query.type  || "").split(",").filter(Boolean);
  const rawStates = Array.isArray(req.query.state)
    ? req.query.state
    : (req.query.state || "").split(",").filter(Boolean);

  const types  = rawTypes.map((t) => t.trim()).filter(Boolean);
  const states = rawStates.map((s) => s.trim()).filter(Boolean);

  const conditions = [];
  const params     = [];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(
      `(s.storename ILIKE $${params.length} OR s.storedescription ILIKE $${params.length})`
    );
  }

  if (types.length > 0) {
    params.push(types);
    conditions.push(`s.storetype = ANY($${params.length})`);
  }

  if (states.length > 0) {
    params.push(states);
    conditions.push(`s.state = ANY($${params.length})`);
  }

  if (city) {
    params.push(`%${city}%`);
    conditions.push(`s.city ILIKE $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const filterParams = [...params];
  params.push(limit);
  const limitIdx  = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  try {
    const [storesResult, countResult] = await Promise.all([
      pool.query(
        `SELECT
           s.storeid, s.storename, s.storedescription, s.storetype,
           s.address, s.city, s.state, s.zip,
           s.phone, s.website, s.hours, s.storeimage,
           s.lat, s.lng,
           s.createdat, s.updatedat, s.userid,
           u.username, u.image AS useravatar
         FROM stores s
         JOIN users u ON u.id = s.userid
         ${where}
         ORDER BY s.state ASC, s.city ASC, s.storename ASC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        params
      ),
      pool.query(
        `SELECT COUNT(*) FROM stores s
         JOIN users u ON u.id = s.userid
         ${where}`,
        filterParams
      ),
    ]);

    return res.status(200).json({
      stores: storesResult.rows,
      total:  parseInt(countResult.rows[0].count, 10),
      page,
      limit,
    });
  } catch (err) {
    console.error("Error fetching stores:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/*
 * GET /stores/types
 * Distinct store types, sorted alphabetically with "Other" last.
 */
router.get("/types", async (req, res) => {
  console.log("GET /stores/types");
  try {
    const result = await pool.query(
      `SELECT DISTINCT COALESCE(storetype, 'Other') AS type
       FROM stores
       ORDER BY type ASC`
    );
    const types = result.rows
      .map((r) => r.type)
      .sort((a, b) => {
        if (a === "Other") return 1;
        if (b === "Other") return -1;
        return a.localeCompare(b);
      });
    return res.status(200).json({ types });
  } catch (err) {
    console.error("Error fetching store types:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/*
 * GET /stores/:storeid
 */
router.get("/:storeid", async (req, res) => {
  console.log("GET /stores/:storeid");

  const { storeid } = req.params;
  if (!/^\d+$/.test(storeid))
    return res.status(400).json({ message: "Invalid store id." });

  try {
    const result = await pool.query(
      `SELECT
         s.storeid, s.storename, s.storedescription, s.storetype,
         s.address, s.city, s.state, s.zip,
         s.phone, s.website, s.hours, s.storeimage,
         s.lat, s.lng,
         s.createdat, s.updatedat, s.userid,
         u.username, u.image AS useravatar
       FROM stores s
       JOIN users u ON u.id = s.userid
       WHERE s.storeid = $1
       ORDER BY s.storename ASC`,
      [parseInt(storeid, 10)]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ message: "Store not found." });

    return res.status(200).json({ store: result.rows[0] });
  } catch (err) {
    console.error("Error fetching store:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/*
 * POST /stores
 */
router.post("/", authenticateJWT, upload.single("storeimage"), async (req, res) => {
  console.log("POST /stores");

  const {
    storename, storedescription, storetype,
    address, city, state, zip,
    phone, website, hours,
    lat, lng,
  } = req.body;

  const userid = req.user.id;

  if (!storename || !storename.trim())
    return res.status(400).json({ message: "Store name is required." });
  if (!address || !address.trim())
    return res.status(400).json({ message: "Street address is required." });
  if (!city || !city.trim())
    return res.status(400).json({ message: "City is required." });

  if (website && website.trim()) {
    try {
      const parsed = new URL(website.trim());
      if (!["http:", "https:"].includes(parsed.protocol))
        return res.status(400).json({ message: "Website must start with http or https." });
    } catch {
      return res.status(400).json({ message: "Please enter a valid website URL." });
    }
  }

  let storeimage = null;
  if (req.file) {
    try {
      const publicId = `store-${userid}-${Date.now()}`;
      storeimage = await saveImage(req.file.buffer, "midwest-cosplay/stores", publicId);
    } catch (imgErr) {
      console.error("Image upload failed:", imgErr);
      return res.status(500).json({ message: "Image upload failed." });
    }
  }

  // Parse coords (sent as strings by FormData)
  const parsedLat = lat ? parseFloat(lat) : null;
  const parsedLng = lng ? parseFloat(lng) : null;

  try {
    const result = await pool.query(
      `INSERT INTO stores
         (userid, storename, storedescription, storetype,
          address, city, state, zip,
          phone, website, hours, storeimage,
          lat, lng)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING storeid`,
      [
        userid,
        storename.trim().slice(0, 120),
        (storedescription || "").trim().slice(0, 600) || null,
        (storetype || "Other").trim().slice(0, 60),
        address.trim().slice(0, 200),
        city.trim().slice(0, 80),
        (state || "").trim().slice(0, 60) || null,
        (zip   || "").trim().slice(0, 10) || null,
        (phone || "").trim().slice(0, 30) || null,
        (website || "").trim().slice(0, 500) || null,
        (hours || "").trim().slice(0, 200) || null,
        storeimage,
        parsedLat && !isNaN(parsedLat) ? parsedLat : null,
        parsedLng && !isNaN(parsedLng) ? parsedLng : null,
      ]
    );

    return res.status(201).json({
      message: "Store added.",
      storeid: result.rows[0].storeid,
    });
  } catch (err) {
    console.error("Error creating store:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/*
 * PUT /stores/:storeid
 */
router.put("/:storeid", authenticateJWT, upload.single("storeimage"), async (req, res) => {
  console.log("PUT /stores/:storeid");

  const { storeid } = req.params;
  if (!/^\d+$/.test(storeid))
    return res.status(400).json({ message: "Invalid store id." });

  const {
    storename, storedescription, storetype,
    address, city, state, zip,
    phone, website, hours,
    lat, lng,
  } = req.body;
  const userid = req.user.id;

  if (!storename || !storename.trim())
    return res.status(400).json({ message: "Store name is required." });
  if (!address  || !address.trim())
    return res.status(400).json({ message: "Street address is required." });
  if (!city || !city.trim())
    return res.status(400).json({ message: "City is required." });

  if (website && website.trim()) {
    try {
      const parsed = new URL(website.trim());
      if (!["http:", "https:"].includes(parsed.protocol))
        return res.status(400).json({ message: "Website must start with http or https." });
    } catch {
      return res.status(400).json({ message: "Please enter a valid website URL." });
    }
  }

  try {
    const existing = await pool.query(
      "SELECT userid, storeimage FROM stores WHERE storeid = $1",
      [parseInt(storeid, 10)]
    );
    if (existing.rows.length === 0)
      return res.status(404).json({ message: "Store not found." });
    if (existing.rows[0].userid !== userid && !req.user.is_admin)
      return res.status(403).json({ message: "Not authorized." });

    let storeimage = existing.rows[0].storeimage;
    if (req.file) {
      try {
        const publicId = `store-${userid}-${Date.now()}`;
        storeimage = await saveImage(req.file.buffer, "midwest-cosplay/stores", publicId);
      } catch (imgErr) {
        console.error("Image upload failed:", imgErr);
        return res.status(500).json({ message: "Image upload failed." });
      }
    }

    const parsedLat = lat ? parseFloat(lat) : null;
    const parsedLng = lng ? parseFloat(lng) : null;

    await pool.query(
      `UPDATE stores
       SET storename        = $1,
           storedescription = $2,
           storetype        = $3,
           address          = $4,
           city             = $5,
           state            = $6,
           zip              = $7,
           phone            = $8,
           website          = $9,
           hours            = $10,
           storeimage       = $11,
           lat              = $12,
           lng              = $13,
           updatedat        = NOW()
       WHERE storeid = $14`,
      [
        storename.trim().slice(0, 120),
        (storedescription || "").trim().slice(0, 600) || null,
        (storetype || "Other").trim().slice(0, 60),
        address.trim().slice(0, 200),
        city.trim().slice(0, 80),
        (state || "").trim().slice(0, 60) || null,
        (zip   || "").trim().slice(0, 10) || null,
        (phone || "").trim().slice(0, 30) || null,
        (website || "").trim().slice(0, 500) || null,
        (hours || "").trim().slice(0, 200) || null,
        storeimage,
        parsedLat && !isNaN(parsedLat) ? parsedLat : null,
        parsedLng && !isNaN(parsedLng) ? parsedLng : null,
        parseInt(storeid, 10),
      ]
    );

    return res.status(200).json({ message: "Store updated." });
  } catch (err) {
    console.error("Error updating store:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/*
 * DELETE /stores/:storeid
 */
router.delete("/:storeid", authenticateJWT, async (req, res) => {
  console.log("DELETE /stores/:storeid");

  const { storeid } = req.params;
  if (!/^\d+$/.test(storeid))
    return res.status(400).json({ message: "Invalid store id." });

  const userid = req.user.id;

  try {
    const existing = await pool.query(
      "SELECT userid FROM stores WHERE storeid = $1",
      [parseInt(storeid, 10)]
    );
    if (existing.rows.length === 0)
      return res.status(404).json({ message: "Store not found." });
    if (existing.rows[0].userid !== userid && !req.user.is_admin)
      return res.status(403).json({ message: "You can only delete your own store listings." });

    await pool.query("DELETE FROM stores WHERE storeid = $1", [parseInt(storeid, 10)]);
    return res.status(200).json({ message: "Store deleted." });
  } catch (err) {
    console.error("Error deleting store:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
