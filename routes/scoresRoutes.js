// ============================================================
// Score API Routes (Express example)
// Mount at:  app.use('/api/scores', scoresRouter)
// ============================================================

const express = require('express');
const router  = express.Router();
const { pool } = require('../db');          // your existing DB connection
const { authenticate } = require('./authMiddleware'); // your existing JWT middleware

// ----------------------------------------------------------
// POST /api/scores
// Save a new score for the authenticated user.
//
// Body: { game: "snake" | "brickbreaker", score: 3800 }
// ----------------------------------------------------------
router.post('/', authenticate, async (req, res) => {
  const { game, score } = req.body;
  const userId   = req.user.id;
  const username = req.user.username;

  if (!game || typeof score !== 'number' || score < 0) {
    return res.status(400).json({ error: 'Invalid game or score.' });
  }

  const validGames = ['snake', 'brickbreaker'];
  if (!validGames.includes(game)) {
    return res.status(400).json({ error: `Unknown game: ${game}` });
  }

  try {
    const result = await pool.query(
      `INSERT INTO game_scores (user_id, username, game, score)
       VALUES ($1, $2, $3, $4)
       RETURNING id, score, created_at`,
      [userId, username, game, score]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /api/scores error:', err);
    return res.status(500).json({ error: 'Could not save score.' });
  }
});

// ----------------------------------------------------------
// GET /api/scores/top?game=snake&limit=10
// Return the top N scores for a game.
// ----------------------------------------------------------
router.get('/top', authenticate, async (req, res) => {
  const { game, limit = 10 } = req.query;

  const validGames = ['snake', 'brickbreaker'];
  if (!validGames.includes(game)) {
    return res.status(400).json({ error: `Unknown game: ${game}` });
  }

  const cap = Math.min(parseInt(limit, 10) || 10, 100);

  try {
    const result = await pool.query(
      `SELECT
          id,
          username,
          score,
          created_at
       FROM game_scores
       WHERE game = $1
       ORDER BY score DESC
       LIMIT $2`,
      [game, cap]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('GET /api/scores/top error:', err);
    return res.status(500).json({ error: 'Could not fetch scores.' });
  }
});

// ----------------------------------------------------------
// GET /api/scores/me?game=snake
// Return the authenticated user's scores for a game.
// ----------------------------------------------------------
router.get('/me', authenticate, async (req, res) => {
  const { game } = req.query;
  const userId   = req.user.id;

  const validGames = ['snake', 'brickbreaker'];
  if (!validGames.includes(game)) {
    return res.status(400).json({ error: `Unknown game: ${game}` });
  }

  try {
    const result = await pool.query(
      `SELECT id, score, created_at
       FROM game_scores
       WHERE user_id = $1 AND game = $2
       ORDER BY score DESC
       LIMIT 20`,
      [userId, game]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('GET /api/scores/me error:', err);
    return res.status(500).json({ error: 'Could not fetch your scores.' });
  }
});

module.exports = router;