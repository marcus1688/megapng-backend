const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../auth/auth");
const mongoose = require("mongoose");

// User Get Gamelist
router.get("/api/gamelist", async (req, res) => {
  try {
    const gamelistCollection = mongoose.connection.db.collection("gamelists");
    const filter = { maintenance: false };
    const games = await gamelistCollection
      .find(filter)
      .sort({ hot: -1, createdAt: -1 })
      .toArray();
    res.json({
      success: true,
      data: games,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
