const express = require("express");
const db      = require("../db");
const router  = express.Router();

/*
 * Parse a Google-style search string into structured tokens.
 *
 * Supports:
 *   "exact phrase"   → must match this exact phrase
 *   -word            → must NOT contain this word
 *   -"exact phrase"  → must NOT contain this exact phrase
 *   word             → regular keyword (all must appear)
 *
 * Returns: { required: string[], exact: string[], negative: string[] }
 *   required — plain keywords that must all appear
 *   exact    — quoted phrases that must all appear verbatim
 *   negative — terms/phrases that must NOT appear
 */
function parseQuery(raw) {
  const required = [];
  const exact    = [];
  const negative = [];

  // Tokenise: pull out -"phrase", "phrase", -word, word
  const regex = /(-?"[^"]*"|-?\S+)/g;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    const token = match[1];
    if (token.startsWith('-"') && token.endsWith('"')) {
      negative.push(token.slice(2, -1).trim());
    } else if (token.startsWith('"') && token.endsWith('"')) {
      exact.push(token.slice(1, -1).trim());
    } else if (token.startsWith("-") && token.length > 1) {
      negative.push(token.slice(1).trim());
    } else {
      required.push(token.trim());
    }
  }

  return {
    required: required.filter(Boolean),
    exact:    exact.filter(Boolean),
    negative: negative.filter(Boolean),
  };
}

/*
 * Build a parameterised WHERE fragment for a set of columns.
 *
 * Every required keyword and exact phrase must appear in at least one column
 * (OR across columns, AND across terms).
 * Every negative term must not appear in any column.
 *
 * Returns { clause: string, params: any[], nextIdx: number }
 */
function buildWhereClause(columns, tokens, startIdx = 1) {
  const { required, exact, negative } = tokens;
  const params  = [];
  const clauses = [];
  let   idx     = startIdx;

  // Required plain keywords — each must match at least one column
  for (const word of required) {
    const colClauses = columns.map(() => {
      params.push(`%${word}%`);
      return `$${idx++} `;
    });
    // Build ILIKE per column
    const fragment = columns
      .map((col, i) => `${col} ILIKE $${startIdx + params.length - columns.length + i}`)
      .join(" OR ");
    clauses.push(`(${columns.map((col) => {
      return `${col} ILIKE $${idx - columns.length + columns.indexOf(col)}`;
    }).join(" OR ")})`);
  }

  // Reset and do it properly with a cleaner approach
  params.length  = 0;
  clauses.length = 0;
  idx            = startIdx;

  // Required plain keywords
  for (const word of required) {
    const colFragments = columns.map((col) => {
      params.push(`%${word}%`);
      return `${col} ILIKE $${idx++}`;
    });
    clauses.push(`(${colFragments.join(" OR ")})`);
  }

  // Exact phrases
  for (const phrase of exact) {
    const colFragments = columns.map((col) => {
      params.push(`%${phrase}%`);
      return `${col} ILIKE $${idx++}`;
    });
    clauses.push(`(${colFragments.join(" OR ")})`);
  }

  // Negative terms — must NOT appear in any column
  for (const term of negative) {
    const colFragments = columns.map((col) => {
      params.push(`%${term}%`);
      return `${col} NOT ILIKE $${idx++}`;
    });
    clauses.push(`(${colFragments.join(" AND ")})`);
  }

  return {
    clause:  clauses.length ? clauses.join(" AND ") : "TRUE",
    params,
    nextIdx: idx,
  };
}

/*
 * GET /search
 * Query params:
 *   query   — search string (supports "exact", -negative, plain keywords)
 *
 * Returns:
 *   users, groups, tutorials, templates  — result arrays
 *   meta.userIama       — all distinct imawhat values across all users
 *   meta.tutorialCats   — all distinct tutorial categories
 *   meta.templateCats   — all distinct template categories
 */
router.get("/", async (req, res) => {
  try {
    const raw = (req.query.query || "").trim();
    console.log("GET /search - raw query:", raw);

    // Always fetch meta (category/iama lists) regardless of whether a query
    // was entered — the frontend needs them to build the filter buttons.
    const metaQuery = `
      SELECT
        (SELECT array_agg(DISTINCT TRIM(val))
           FROM users, LATERAL unnest(string_to_array(imawhat, ',')) AS val
          WHERE imawhat IS NOT NULL AND TRIM(val) <> ''
        ) AS user_iama,
        (SELECT array_agg(DISTINCT tutorialcategory ORDER BY tutorialcategory)
           FROM tutorials
          WHERE tutorialcategory IS NOT NULL AND tutorialcategory <> ''
        ) AS tutorial_cats,
        (SELECT array_agg(DISTINCT templatecategory ORDER BY templatecategory)
           FROM templates
          WHERE templatecategory IS NOT NULL AND templatecategory <> ''
        ) AS template_cats
    `;
    const metaResult = await db.query(metaQuery);
    const metaRow    = metaResult.rows[0] || {};

    const meta = {
      userIama:     (metaRow.user_iama     || []).sort(),
      tutorialCats: (metaRow.tutorial_cats || []),
      templateCats: (metaRow.template_cats || []),
    };

    // Empty query — return meta only, no results
    if (!raw) {
      return res.status(200).json({
        users: [], groups: [], tutorials: [], templates: [],
        meta,
      });
    }

    const tokens = parseQuery(raw);
    const hasTerms = tokens.required.length || tokens.exact.length || tokens.negative.length;

    if (!hasTerms) {
      return res.status(200).json({
        users: [], groups: [], tutorials: [], templates: [],
        meta,
      });
    }

    // ── Build per-table queries ───────────────────────────────────────────
    const userCols     = ["complete", "inprogress", "firstname", "lastname", "username", "cosplaygroup", "imawhat"];
    const groupCols    = ["groupname", "groupcity", "groupstate"];
    const tutorialCols = ["t.tutorialtitle", "t.tutorialdescription", "t.tutorialcategory", "u.username"];
    const templateCols = ["t.templatetitle", "t.templatedescription", "t.templatecategory", "u.username"];

    const userWhere     = buildWhereClause(userCols,     tokens, 1);
    const groupWhere    = buildWhereClause(groupCols,    tokens, 1);
    const tutorialWhere = buildWhereClause(tutorialCols, tokens, 1);
    const templateWhere = buildWhereClause(templateCols, tokens, 1);

    const usersQuery = `
      SELECT id, firstname, lastname, username, imawhat, etsy,
             complete, inprogress, cosplaygroup, image
      FROM users
      WHERE ${userWhere.clause}`;

    const groupsQuery = `
      SELECT groupid, groupname, groupslug, groupimage, groupcity, groupstate, groupwebsite
      FROM groups
      WHERE ${groupWhere.clause}`;

    const tutorialsQuery = `
      SELECT t.tutorialid, t.tutorialtitle, t.tutorialurl,
             t.tutorialdescription, t.tutorialcategory,
             t.tutorialimage, t.userid,
             u.username, u.image AS useravatar
      FROM tutorials t
      JOIN users u ON u.id = t.userid
      WHERE ${tutorialWhere.clause}
      ORDER BY t.createdat DESC`;

    const templatesQuery = `
      SELECT t.templateid, t.templatetitle, t.templateurl,
             t.templatedescription, t.templatecategory,
             t.templateisfree, t.templateimage, t.userid,
             u.username, u.image AS useravatar
      FROM templates t
      JOIN users u ON u.id = t.userid
      WHERE ${templateWhere.clause}
      ORDER BY t.createdat DESC`;

    const [usersResult, groupsResult, tutorialsResult, templatesResult] = await Promise.all([
      db.query(usersQuery,     userWhere.params),
      db.query(groupsQuery,    groupWhere.params),
      db.query(tutorialsQuery, tutorialWhere.params),
      db.query(templatesQuery, templateWhere.params),
    ]);

    console.log(
      `Search done. members=${usersResult.rows.length} groups=${groupsResult.rows.length} ` +
      `tutorials=${tutorialsResult.rows.length} templates=${templatesResult.rows.length}`
    );

    return res.status(200).json({
      users:     usersResult.rows,
      groups:    groupsResult.rows,
      tutorials: tutorialsResult.rows,
      templates: templatesResult.rows,
      meta,
    });

  } catch (err) {
    console.error("GET /search error:", err);
    return res.status(500).json({ message: "Error fetching search results", error: err.message });
  }
});

module.exports = router;