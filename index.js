const express = require("express");
const path = require("path"); 
const app = express();
const port = process.env.PORT || 8800;
const cors = require('cors')


app.use(cors())

// usersroutes
const authRoutes = require("./routes/authRoutes");
const usersRoute = require("./routes/usersRoute");
const createRoute = require("./routes/createRoute");
const searchRoute = require("./routes/searchRoutes");
const resetpasswordRoute = require("./routes/resetpasswordRoutes.js");

//Public routes
const publicRoutes = require("./routes/publicRoutes");

//Testing routes
const tshirtRoutes = require("./routes/tshirtRoutes");
const copyrightRoutes = require("./routes/copyrightRoutes");

// Middleware
app.use(express.json());

// Use routes
app.use("/login", authRoutes);
app.use("/resetpassword", resetpasswordRoute);
app.use("/users", usersRoute);
app.use("/search", searchRoute);
app.use("/createnew", createRoute);


app.use("/public", publicRoutes);

app.use("/tshirt", tshirtRoutes);
app.use("/copyright", copyrightRoutes); 

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
