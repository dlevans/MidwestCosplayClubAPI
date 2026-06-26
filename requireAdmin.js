// requireAdmin.js
const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided." });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.is_admin) return res.status(403).json({ message: "Admins only." });
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token." });
  }
};