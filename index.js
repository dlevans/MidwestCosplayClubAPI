const express = require("express");
const path = require("path"); 
const app = express();
const port = process.env.PORT || 8800;
const cors = require('cors')


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
const resetpasswordRoute = require("./routes/resetpasswordRoutes.js");

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


app.use("/public", publicRoutes);
app.use("/guestbook", guestbookRoutes);

app.use("/tshirt", tshirtRoutes);
app.use("/copyright", copyrightRoutes); 

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});