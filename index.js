const express = require('express');
const router  = express.Router();
const db = require('./db');
const authenticate = require('./authMiddleware');

// ----------------------------------------------------------
// Request logger — fires for every /api/scores/* hit
// ----------------------------------------------------------
router.use((req, res, next) => {
  console.log(`[scores] ${req.method} ${req.originalUrl}`);
  if (req.body && Object.keys(req.body).length) {
    console.log('[scores] body:', JSON.stringify(req.body));
  }
  if (req.query && Object.keys(req.query).length) {
    console.log('[scores] query:', JSON.stringify(req.query));
  }

  // Intercept the response to log the status code
  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    console.log(`[scores] response ${res.statusCode}:`, JSON.stringify(payload));
    return originalJson(payload);
  };
 
  next();
});

// ----------------------------------------------------------
// POST /api/scores
// Body: { game: "snake" | "brickbreaker", score: 3800 }
// ----------------------------------------------------------
router.post('/', authenticate, async (req, res) => {
  console.log('[scores] POST / — user from token:', JSON.stringify(req.user));

  const { game, score } = req.body;
  const userId   = req.user?.id;
  const username = req.user?.username;

  if (!game || typeof score !== 'number' || score < 0) {
    console.log('[scores] POST / — validation failed: game =', game, '| score =', score, '| typeof score =', typeof score);
    return res.status(400).json({ error: 'Invalid game or score.' });
  }

  const validGames = ['snake', 'brickbreaker'];
  if (!validGames.includes(game)) {
    console.log('[scores] POST / — unknown game:', game);
    return res.status(400).json({ error: `Unknown game: ${game}` });
  }

  console.log(`[scores] POST / — inserting: userId=${userId} username=${username} game=${game} score=${score}`);

  try {
    const result = await db.query(
      `INSERT INTO game_scores (user_id, username, game, score)
       VALUES ($1, $2, $3, $4)
       RETURNING id, score, created_at`,
      [userId, username, game, score]
    );
    console.log('[scores] POST / — insert succeeded, row:', JSON.stringify(result.rows[0]));
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[scores] POST / — DB error:', err.message);
    console.error('[scores] POST / — full error:', err);
    return res.status(500).json({ error: 'Could not save score.' });
  }
});

// ----------------------------------------------------------
// GET /api/scores/top?game=snake&limit=10
// ----------------------------------------------------------
router.get('/top', authenticate, async (req, res) => {
  console.log('[scores] GET /top — user from token:', JSON.stringify(req.user));

  const { game, limit = 10 } = req.query;

  const validGames = ['snake', 'brickbreaker'];
  if (!validGames.includes(game)) {
    console.log('[scores] GET /top — unknown game:', game);
    return res.status(400).json({ error: `Unknown game: ${game}` });
  }

  const cap = Math.min(parseInt(limit, 10) || 10, 100);
  console.log(`[scores] GET /top — querying: game=${game} limit=${cap}`);

  try {
    const result = await db.query(
      `SELECT id, username, score, created_at
       FROM game_scores
       WHERE game = $1
       ORDER BY score DESC
       LIMIT $2`,
      [game, cap]
    );
    console.log(`[scores] GET /top — returned ${result.rows.length} rows`);
    return res.json(result.rows);
  } catch (err) {
    console.error('[scores] GET /top — DB error:', err.message);
    console.error('[scores] GET /top — full error:', err);
    return res.status(500).json({ error: 'Could not fetch scores.' });
  }
}); 

// ----------------------------------------------------------
// GET /api/scores/me?game=snake
// ----------------------------------------------------------
router.get('/me', authenticate, async (req, res) => {
  console.log('[scores] GET /me — user from token:', JSON.stringify(req.user));

  const { game } = req.query;
  const userId = req.user?.id;

  const validGames = ['snake', 'brickbreaker'];
  if (!validGames.includes(game)) {
    console.log('[scores] GET /me — unknown game:', game);
    return res.status(400).json({ error: `Unknown game: ${game}` });
  }

  console.log(`[scores] GET /me — querying: userId=${userId} game=${game}`);

  try {
    const result = await db.query(
      `SELECT id, score, created_at
       FROM game_scores
       WHERE user_id = $1 AND game = $2
       ORDER BY score DESC
       LIMIT 20`,
      [userId, game]
    );
    console.log(`[scores] GET /me — returned ${result.rows.length} rows`);
    return res.json(result.rows);
  } catch (err) {
    console.error('[scores] GET /me — DB error:', err.message);
    console.error('[scores] GET /me — full error:', err);
    return res.status(500).json({ error: 'Could not fetch your scores.' });
  }
});

module.exports = router;