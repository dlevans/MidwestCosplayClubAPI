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
 * Edit titles/descriptions/requiresimage/requirestext freely. DO NOT change
 * or reuse an `id` once players may have started completing tasks with it —
 * id is the foreign key into the huntprogress table. Add a new item with a
 * new id instead of renaming an old one's id.
 *
 * requiresimage: task isn't complete until a photo is attached.
 * requirestext: task isn't complete until a written answer is saved.
 * A task can require both, either, or neither (neither = plain checkbox).
 */
const HUNT_ITEMS = [
  // --- Photo & find tasks ---------------------------------------------
  {
    id: "mascot-photo",
    title: "Find the Planet Anime mascot",
    description: "Snap a photo of yourself with the Planet Anime mascot.",
    requiresimage: true,
    requirestext: false,
    points: 2,
  },
  {
    id: "ad-costs",
    title: "Advertising is expensive",
    description: "Take a photo in front of a Planet Anime billboard.",
    requiresimage: true,
    requirestext: false,
    points: 1,
  },
  {
    id: "fandom-fun",
    title: "Rep your scene",
    description: "Find someone cosplaying your favorite character. Take a selfie.",
    requiresimage: true,
    requirestext: true,
    textprompt: "What fandom are they from?",
    points: 3,
  },
  {
    id: "granted-wish",
    title: "Collect the seven dragon balls",
    description: "Collect the seven dragon balls, make a wish.",
    requiresimage: true,
    requirestext: true,
    textprompt: "What did you wish for?",
    points: 5,
  },
  {
    id: "tokyo-drift",
    title: "I wonder if you know, how they live in Tokyo",
    description: "Snap a photo of your favorite Itasha car.",
    requiresimage: true,
    requirestext: false,
    points: 1,
  },
  {
    id: "peanut-butter-chocolate",
    title: "Two great things that taste great together",
    description: "Find a cosplay mashup. Take a photo.",
    requiresimage: true,
    requirestext: true,
    textprompt: "What characters are they combining?",
    points: 3,
  },
  {
    id: "minions-assemble",
    title: "Assemble the minions",
    description: "Take a photo with a volunteer.",
    requiresimage: true,
    requirestext: false,
    points: 100,
  },
  {
    id: "longest-yard",
    title: "It's not about the size...",
    description: "Collect ribbons. Take a photo of your haul.",
    requiresimage: true,
    requirestext: true,
    textprompt: "How long is it (feet and inches)?",
    points: 1,
  },
  {
    id: "jukebox-hero",
    title: "Jukebox Hero",
    description: "Sing a song at karaoke. Take a photo.",
    requiresimage: true,
    requirestext: true,
    textprompt: "What song did you sing?",
    points: 5,
  },
  {
    id: "zeuss-rule1",
    title: "Take a photo with a guest (1 of 5)",
    description: "Cosplayers, makers, Ghostbusters, etc. Collect them all.",
    requiresimage: true,
    requirestext: true,
    textprompt: "Who did you take a photo with?",
    points: 1,
  },
  {
    id: "zeuss-rule2",
    title: "Take a photo with a guest (2 of 5)",
    description: "Cosplayers, makers, Ghostbusters, etc. Collect them all.",
    requiresimage: true,
    requirestext: true,
    textprompt: "Who did you take a photo with?",
    points: 2,
  },
  {
    id: "zeuss-rule3",
    title: "Take a photo with a guest (3 of 5)",
    description: "Cosplayers, makers, Ghostbusters, etc. Collect them all.",
    requiresimage: true,
    requirestext: true,
    textprompt: "Who did you take a photo with?",
    points: 3,
  },
  {
    id: "zeuss-rule4",
    title: "Take a photo with a guest (4 of 5)",
    description: "Cosplayers, makers, Ghostbusters, etc. Collect them all.",
    requiresimage: true,
    requirestext: true,
    textprompt: "Who did you take a photo with?",
    points: 4,
  },
  {
    id: "zeuss-rule5",
    title: "Take a photo with a guest (5 of 5)",
    description: "Cosplayers, makers, Ghostbusters, etc. Collect them all.",
    requiresimage: true,
    requirestext: true,
    textprompt: "Who did you take a photo with?",
    points: 5,
  },

  // --- Artist Alley / vendor hall --------------------------------------
  {
    id: "starving-artist",
    title: "Support a starving artist",
    description: "Buy a print or item from an Artist Alley table for $10 or less. Photograph your purchase.",
    requiresimage: true,
    requirestext: false,
    points: 2,
  },
  {
    id: "plush-life",
    title: "Plush life",
    description: "Find the largest plushie for sale in the vendor hall. Photograph it.",
    requiresimage: true,
    requirestext: false,
    points: 2,
  },
  {
    id: "business-casual",
    title: "Business casual",
    description: "Get a business card or social media handle from an artist or vendor.",
    requiresimage: false,
    requirestext: true,
    textprompt: "What's their shop name?",
    points: 2,
  },
  {
    id: "throwback-thursday",
    title: "Throwback Thursday",
    description: "Find a vendor selling merchandise from an anime that's over 20 years old. Photograph it.",
    requiresimage: true,
    requirestext: true,
    textprompt: "What anime is it from?",
    points: 3,
  },
  {
    id: "price-check",
    title: "Price check",
    description: "Find the most expensive single item you can in the vendor hall. Photograph the price tag.",
    requiresimage: true,
    requirestext: true,
    textprompt: "How much was it?",
    points: 2,
  },

  // --- Cosplay spotting --------------------------------------------------
  {
    id: "squad-goals",
    title: "Squad goals",
    description: "Find a group cosplay of 3 or more people from the same series. Photograph the group.",
    requiresimage: true,
    requirestext: false,
    points: 3,
  },
  {
    id: "gender-bend",
    title: "Gender bend",
    description: "Find a crossplayer (cosplaying a character of a different gender than their own). Photograph them.",
    requiresimage: true,
    requirestext: false,
    points: 2,
  },
  {
    id: "wingspan",
    title: "Wingspan",
    description: "Find the most elaborate wings in the building. Photograph them.",
    requiresimage: true,
    requirestext: false,
    points: 3,
  },
  {
    id: "armed-and-fabulous",
    title: "Armed and fabulous",
    description: "Spot a prop weapon at least 4 feet long. Photograph it.",
    requiresimage: true,
    requirestext: false,
    points: 2,
  },
  {
    id: "press-start",
    title: "Press start",
    description: "Find someone cosplaying a video game character. Photograph them.",
    requiresimage: true,
    requirestext: true,
    textprompt: "What game are they from?",
    points: 2,
  },
  {
    id: "pit-crew",
    title: "Pit crew",
    description: "Find someone helping repair or adjust another cosplayer's costume. Photograph the moment.",
    requiresimage: true,
    requirestext: false,
    points: 4,
  },
  {
    id: "rival-teams",
    title: "Rival teams",
    description: "Find two cosplayers from rival factions in the same show (heroes vs. villains, rival schools, etc). Get them in one photo.",
    requiresimage: true,
    requirestext: false,
    points: 4,
  },
  {
    id: "crowned-champion",
    title: "Crowned champion",
    description: "Find the tallest, most elaborate headpiece or wig at the con. Photograph it.",
    requiresimage: true,
    requirestext: false,
    points: 2,
  },

  // --- Panels & programming ----------------------------------------------
  {
    id: "front-row",
    title: "Front row",
    description: "Attend part of a panel and photograph the panel room's sign or screen.",
    requiresimage: true,
    requirestext: true,
    textprompt: "What was the panel about?",
    points: 2,
  },
  {
    id: "fan-theory",
    title: "Fan theory",
    description: "Ask someone at a panel or in the hallway for their wildest fan theory.",
    requiresimage: false,
    requirestext: true,
    textprompt: "What's the theory?",
    points: 2,
  },
  {
    id: "raise-your-hand",
    title: "Raise your hand",
    description: "Ask a question during a panel Q&A. Photograph the panel room afterward as proof you were there.",
    requiresimage: true,
    requirestext: true,
    textprompt: "What did you ask?",
    points: 3,
  },

  // --- Games & activities --------------------------------------------------
  {
    id: "high-score",
    title: "High score",
    description: "Win a prize or high score at an arcade or game room activity. Photograph your win.",
    requiresimage: true,
    requirestext: false,
    points: 3,
  },
  {
    id: "table-for-two",
    title: "Table for two",
    description: "Join a stranger for a tabletop or card game.",
    requiresimage: false,
    requirestext: true,
    textprompt: "Who won?",
    points: 3,
  },
  {
    id: "handheld-hero",
    title: "Handheld hero",
    description: "Find someone playing a handheld video game console in public. Photograph it.",
    requiresimage: true,
    requirestext: false,
    points: 1,
  },
  {
    id: "cardboard-arena",
    title: "Cardboard arena",
    description: "Challenge a stranger to rock-paper-scissors, best of three. Photograph your opponent.",
    requiresimage: true,
    requirestext: true,
    textprompt: "Did you win?",
    points: 1,
  },

  // --- Taskmaster-style physical/silly challenges -------------------------
  {
    id: "plushie-balance",
    title: "Plushie balance",
    description: "Balance a plushie on your head and walk 10 steps without it falling. Photograph the attempt.",
    requiresimage: true,
    requirestext: false,
    points: 2,
  },
  {
    id: "naruto-run",
    title: "Naruto run",
    description: "Do your best anime sprint (arms back, leaning forward) down a hallway. Get a friend to photograph it.",
    requiresimage: true,
    requirestext: false,
    points: 2,
  },
  {
    id: "dramatic-entrance",
    title: "Dramatic entrance",
    description: "Strike the most dramatic anime pose you can manage. Photograph it.",
    requiresimage: true,
    requirestext: false,
    points: 1,
  },
  {
    id: "mirror-mirror",
    title: "Mirror mirror",
    description: "Find a stranger and do a synchronized pose together. Photograph it.",
    requiresimage: true,
    requirestext: false,
    points: 3,
  },
  {
    id: "shook",
    title: "Shook",
    description: "Make your most convincing shocked anime face. Photograph it.",
    requiresimage: true,
    requirestext: false,
    points: 1,
  },
  {
    id: "villain-monologue",
    title: "Villain monologue",
    description: "Find a villain cosplayer and ask for their best evil laugh or one-line monologue.",
    requiresimage: false,
    requirestext: true,
    textprompt: "Rate the performance, 1-10",
    points: 3,
  },
  {
    id: "face-the-music",
    title: "Face the music",
    description: "Find someone with face paint or elaborate makeup. Photograph it.",
    requiresimage: true,
    requirestext: true,
    textprompt: "What's the design based on?",
    points: 2,
  },
  {
    id: "dance-lesson",
    title: "Dance lesson",
    description: "Get someone to teach you a move from an anime opening or ending. Photograph the lesson.",
    requiresimage: true,
    requirestext: true,
    textprompt: "What anime is the dance from?",
    points: 4,
  },
  {
    id: "statue-challenge",
    title: "Statue challenge",
    description: "Freeze in an action pose for 30 seconds in a public area of the con. Get someone to time and photograph you.",
    requiresimage: true,
    requirestext: false,
    points: 2,
  },

  // --- GISHWHES-style creative/weird tasks --------------------------------
  {
    id: "crossover-battle",
    title: "Crossover battle",
    description: "Get cosplayers from two completely different franchises to pose like they're about to fight. Photograph it.",
    requiresimage: true,
    requirestext: false,
    points: 4,
  },
  {
    id: "pin-trade",
    title: "Pin trade",
    description: "Trade a small item (pin, sticker, button) with a stranger for a compliment. Photograph the trade.",
    requiresimage: true,
    requirestext: false,
    points: 3,
  },
  {
    id: "bigger-than-you",
    title: "Bigger than you",
    description: "Find a prop or costume piece that's physically bigger than you are. Photograph yourself next to it.",
    requiresimage: true,
    requirestext: false,
    points: 2,
  },
  {
    id: "meta-moment",
    title: "Meta moment",
    description: "Find a \"no photography\" sign anywhere in the building and take a photo of the sign itself.",
    requiresimage: true,
    requirestext: false,
    points: 2,
  },
  {
    id: "opposite-day",
    title: "Opposite day",
    description: "Find two cosplayers whose characters are complete opposites (good/evil, hero/sidekick, hot/cold) and get them in a photo together.",
    requiresimage: true,
    requirestext: false,
    points: 4,
  },
  {
    id: "autograph-hunt",
    title: "Autograph hunt",
    description: "Get 3 different strangers to sign a notebook, card, or your badge. Photograph the signatures.",
    requiresimage: true,
    requirestext: false,
    points: 3,
  },

  // --- Convention culture / food -------------------------------------------
  {
    id: "snack-run",
    title: "Snack run",
    description: "Try a Japanese snack or drink you've never had before. Photograph it.",
    requiresimage: true,
    requirestext: true,
    textprompt: "What was it?",
    points: 3,
  },
  {
    id: "caffeine-run",
    title: "Caffeine run",
    description: "Find the nearest coffee or drink stand to the main hall. Photograph the menu.",
    requiresimage: true,
    requirestext: false,
    points: 1,
  },
  {
    id: "convention-cuisine",
    title: "Convention cuisine",
    description: "Photograph the most creative food or drink item being sold at the con.",
    requiresimage: true,
    requirestext: false,
    points: 2,
  },
  {
    id: "chopstick-champion",
    title: "Chopstick champion",
    description: "Use chopsticks to eat something at the con, even if it's not traditionally eaten with them. Photograph the attempt.",
    requiresimage: true,
    requirestext: false,
    points: 2,
  },

  // --- Social / interaction ---------------------------------------------
  {
    id: "home-away",
    title: "Home away from home",
    description: "Find someone who traveled from out of state (or out of the country) to attend.",
    requiresimage: false,
    requirestext: true,
    textprompt: "Where are they from?",
    points: 3,
  },
  {
    id: "best-memory",
    title: "Best memory",
    description: "Ask a stranger for their favorite convention memory ever.",
    requiresimage: false,
    requirestext: true,
    textprompt: "What did they say?",
    points: 2,
  },
  {
    id: "first-timer",
    title: "First timer",
    description: "Find someone attending their very first convention. Photograph them.",
    requiresimage: true,
    requirestext: false,
    points: 2,
  },
  {
    id: "veteran-status",
    title: "Veteran status",
    description: "Find someone who's been coming to this convention for 2+ years. Ask what's changed the most.",
    requiresimage: false,
    requirestext: true,
    textprompt: "What did they say?",
    points: 3,
  },
  {
    id: "new-friend",
    title: "New friend",
    description: "Introduce yourself to someone you've never met and get a photo together.",
    requiresimage: true,
    requirestext: false,
    points: 3,
  },

  // --- Skills & talent -------------------------------------------------
  {
    id: "quick-sketch",
    title: "Quick sketch",
    description: "Draw a quick sketch of your favorite character, however rough. Photograph your masterpiece.",
    requiresimage: true,
    requirestext: false,
    points: 3,
  },
  {
    id: "voice-actor",
    title: "Voice actor",
    description: "Do your best impression of a character's voice for a friend to judge.",
    requiresimage: false,
    requirestext: true,
    textprompt: "Whose voice, and how good was it (1-10)?",
    points: 2,
  },
  {
    id: "origami-master",
    title: "Origami master",
    description: "Fold an origami crane (or attempt one). Photograph the result.",
    requiresimage: true,
    requirestext: false,
    points: 3,
  },
  {
    id: "language-lesson",
    title: "Language lesson",
    description: "Learn a Japanese phrase from another attendee.",
    requiresimage: false,
    requirestext: true,
    textprompt: "What phrase, and what does it mean?",
    points: 4,
  },

  // --- Venue exploration -------------------------------------------------
  {
    id: "you-are-here",
    title: "You are here",
    description: "Find the convention map or directory board. Photograph it.",
    requiresimage: true,
    requirestext: false,
    points: 1,
  },
  {
    id: "lost-and-found",
    title: "Lost and found",
    description: "Find the lost & found table or booth. Photograph it.",
    requiresimage: true,
    requirestext: false,
    points: 1,
  },
  {
    id: "welcome-committee",
    title: "Welcome committee",
    description: "Take a photo at the convention's main entrance sign or banner.",
    requiresimage: true,
    requirestext: false,
    points: 1,
  },
  {
    id: "limited-edition",
    title: "Limited edition",
    description: "Find a limited-edition or convention-exclusive item for sale. Photograph it.",
    requiresimage: true,
    requirestext: true,
    textprompt: "What was it?",
    points: 3,
  },
  {
    id: "shortest-route",
    title: "Shortest route",
    description: "Photograph the sign for the restroom closest to registration — for anyone who asks you later.",
    requiresimage: true,
    requirestext: false,
    points: 1,
  },
  {
    id: "pikachu-hunt",
    title: "Pikachu, I choose you",
    description: "Spot a Pok\u00e9mon cosplay, plush, or costume piece anywhere at the con. Photograph it.",
    requiresimage: true,
    requirestext: true,
    textprompt: "Which Pok\u00e9mon?",
    points: 2,
  },

  // --- Group tasks ---------------------------------------------------------
  {
    id: "full-squad",
    title: "Full squad",
    description: "Get your whole group into one photo doing a themed pose together.",
    requiresimage: true,
    requirestext: false,
    points: 2,
  },
  {
    id: "rival-hunters",
    title: "Rival hunters",
    description: "Find another team also doing the scavenger hunt. Photograph your teams together.",
    requiresimage: true,
    requirestext: false,
    points: 3,
  },
];

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
      "SELECT itemid, completed, imageurl, textresponse, completedat FROM huntprogress WHERE userid = $1",
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
        textresponse: progress?.textresponse || "",
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
 * Top 10 scavenger hunt players by total points. Points live on the
 * HUNT_ITEMS list above (not in the DB), so this pulls every completed
 * (userid, itemid) pair, looks up each item's point value in JS, and sums
 * per user. Kept out of the `game_scores` table on purpose since hunt
 * "scores" are derived from progress rather than being their own scored
 * events.
 */
router.get("/leaderboard", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT hp.userid, u.username, hp.itemid
       FROM huntprogress hp
       JOIN users u ON u.id = hp.userid
       WHERE hp.completed = true`
    );

    const pointsByItem = Object.fromEntries(HUNT_ITEMS.map((i) => [i.id, i.points || 0]));

    const totals = new Map();
    for (const row of result.rows) {
      const pts = pointsByItem[row.itemid] || 0;
      if (!totals.has(row.userid)) {
        totals.set(row.userid, { userid: row.userid, username: row.username, score: 0 });
      }
      totals.get(row.userid).score += pts;
    }

    const leaderboard = Array.from(totals.values())
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    return res.status(200).json(leaderboard);
  } catch (err) {
    console.error("Error fetching hunt leaderboard:", err);
    return res.status(500).json({ message: "Error fetching hunt leaderboard", error: err.message });
  }
});

/*
 * Mark a task complete, optionally attaching/replacing a photo and/or a
 * text answer. Upserts, so this also works to save a fresh photo or edited
 * answer for an already-completed task.
 */
router.post("/:itemid/complete", (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(500).json({ message: "Upload error", error: err.message });

    const itemId = req.params.itemid;
    const item = HUNT_ITEMS.find((i) => i.id === itemId);
    if (!item) {
      return res.status(404).json({ message: "Unknown hunt task." });
    }

    const submittedText = typeof req.body.textresponse === "string"
      ? req.body.textresponse.trim()
      : "";

    try {
      const existingResult = await db.query(
        "SELECT imageurl, textresponse FROM huntprogress WHERE userid = $1 AND itemid = $2",
        [req.user.id, itemId]
      );
      const existing = existingResult.rows[0] || null;

      // Save whatever was submitted this call, falling back to whatever was
      // already saved for the other field(s). A task like "mystery-item"
      // needs both a photo AND an answer, but those can arrive in separate
      // requests — save each as it comes in rather than rejecting one for
      // being submitted without the other.
      let imageUrl = existing?.imageurl || null;
      if (req.file) {
        imageUrl = await uploadToCloudinary(req.file.buffer, `${req.user.id}-${itemId}`);
      }

      const textResponse = submittedText || existing?.textresponse || null;

      // Only mark the task fully complete once every requirement it has is
      // satisfied. A partial save (e.g. photo only, on a task that also
      // needs text) is stored but left uncompleted until the rest comes in.
      const isComplete =
        (!item.requiresimage || !!imageUrl) &&
        (!item.requirestext || !!textResponse);

      const result = await db.query(
        `INSERT INTO huntprogress (userid, itemid, completed, imageurl, textresponse, completedat)
         VALUES ($1, $2, $3, $4, $5, CASE WHEN $3 THEN NOW() ELSE NULL END)
         ON CONFLICT (userid, itemid)
         DO UPDATE SET completed = $3,
                       imageurl = $4,
                       textresponse = $5,
                       completedat = CASE WHEN $3 THEN NOW() ELSE huntprogress.completedat END
         RETURNING itemid, completed, imageurl, textresponse, completedat`,
        [req.user.id, itemId, isComplete, imageUrl, textResponse]
      );

      return res.status(200).json({ message: "Task updated", progress: result.rows[0] });
    } catch (err) {
      console.error("Error saving hunt progress:", err);
      return res.status(500).json({ message: "Error saving hunt progress", error: err.message });
    }
  });
});

/*
 * Un-check a task. Any uploaded photo/answer is kept on file so the player
 * doesn't have to redo it if they just re-check the box.
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