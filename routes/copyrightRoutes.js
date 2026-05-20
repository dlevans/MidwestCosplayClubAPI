const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  console.log("GET /copyright");
  res.status(200).send({
    icon: "©️",
  });
});

module.exports = router;
