const jwt = require("jsonwebtoken");

// Use the exact same fallback secret configuration as authRoutes.js
const JWT_SECRET = process.env.JWT_SECRET;

const authenticateJWT = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(403).json({ message: "Access denied: token missing" });

  jwt.verify(token, JWT_SECRET, (err, decodedPayload) => {
    if (err) {
      console.error("JWT Verification failed:", err);
      return res.status(403).json({ message: "Invalid token" });
    }

    // Map both id styles to req.user so no backend or frontend components break
    req.user = {
      id: decodedPayload.id,
      ID: decodedPayload.id,
      username: decodedPayload.username
    };

    next();
  });
};

module.exports = authenticateJWT;