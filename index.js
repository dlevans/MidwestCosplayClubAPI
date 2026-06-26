const express = require("express");
const path = require("path"); 
const app = express();
const port = process.env.PORT || 8800;
const cors = require('cors')
const db = require("./db");


app.use(cors())
// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true })); 

// usersroutes
const authRoutes = require("./routes/authRoutes");
const usersRoute = require("./routes/usersRoute");
const groupsRoute = require("./routes/groupsRoute");
const createRoute = require("./routes/createRoute");
const searchRoute = require("./routes/searchRoutes");
const tutorialRoutes = require("./routes/tutorialRoutes");
const templateRoutes = require("./routes/templateRoutes");
const resetpasswordRoute = require("./routes/resetpasswordRoutes.js");
const adminRoute = require("./routes/admin.js");


//Public routes
const publicRoutes = require("./routes/publicRoutes");
const guestbookRoutes = require("./routes/guestbookRoutes");

//Testing routes
const tshirtRoutes = require("./routes/tshirtRoutes");
const copyrightRoutes = require("./routes/copyrightRoutes");

// Use routes
app.use("/login", authRoutes);
app.use("/resetpassword", resetpasswordRoute);
app.use("/users", usersRoute);
app.use("/groups", groupsRoute);
app.use("/search", searchRoute);
app.use("/createnew", createRoute);
app.use("/tutorials", tutorialRoutes);
app.use("/templates", templateRoutes);
app.use("/api", adminRoute);



app.use("/public", publicRoutes);
app.use("/guestbook", guestbookRoutes);

app.use("/tshirt", tshirtRoutes);
app.use("/copyright", copyrightRoutes); 

app.get("/sitemap", async (req, res) => {
    try {
        // Fetch public records from the database
        const usersResult = await db.query("SELECT username FROM users ORDER BY id DESC");
        
        let groupsResult = { rows: [] };
        try {
            groupsResult = await db.query("SELECT groupslug FROM groups WHERE groupslug IS NOT NULL");
        } catch (e) {
            console.log("Groups table check skipped or not present.");
        }

        const domain = "https://midwestcosplay.club";
        const currentDate = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD

        // Core static URLs
        const staticPages = [
            "",
            "/calendar",
            "/tutorials",
            "/measurements",
            "/search",
            "/login",
            "/games"
        ];

        // Build the XML string
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

        // Map Static Pages
        staticPages.forEach(page => {
            xml += `  <url>\n`;
            xml += `    <loc>${domain}${page}</loc>\n`;
            xml += `    <lastmod>${currentDate}</lastmod>\n`;
            xml += `    <changefreq>weekly</changefreq>\n`;
            xml += `    <priority>${page === "" ? "1.0" : "0.8"}</priority>\n`;
            xml += `  </url>\n`;
        });

        // Map User Profiles
        usersResult.rows.forEach(user => {
            if (user.username) {
                xml += `  <url>\n`;
                xml += `    <loc>${domain}/public/${encodeURIComponent(user.username)}</loc>\n`;
                xml += `    <lastmod>${currentDate}</lastmod>\n`;
                xml += `    <changefreq>weekly</changefreq>\n`;
                xml += `    <priority>0.6</priority>\n`;
                xml += `  </url>\n`;
            }
        });

        // Map Groups
        groupsResult.rows.forEach(group => {
            if (group.groupslug) {
                xml += `  <url>\n`;
                xml += `    <loc>${domain}/public/group/${encodeURIComponent(group.groupslug.toLowerCase())}</loc>\n`;
                xml += `    <lastmod>${currentDate}</lastmod>\n`;
                xml += `    <changefreq>weekly</changefreq>\n`;
                xml += `    <priority>0.5</priority>\n`;
                xml += `  </url>\n`;
            }
        });

        xml += `</urlset>`;

        // Force XML content type headers so search engines parse it natively
        res.header("Content-Type", "application/xml");
        return res.status(200).send(xml);

    } catch (error) {
        console.error("Dynamic sitemap generation failed:", error);
        return res.status(500).send("Error generating sitemap");
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});