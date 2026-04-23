const express = require("express");
const router = express.Router();
const {
  getLatestReviews,
  attachMovieInfoToReviews,
  getLatestMovies,
} = require("../services/homeService");

router.get("/", async (req, res) => {
  try {
    const [latestReviewsRaw, latestMovies] = await Promise.all([
      getLatestReviews(),
      getLatestMovies(),
    ]);

    const latestReviews = await attachMovieInfoToReviews(latestReviewsRaw);

    res.render("index", {
      latestMovies,
      latestReviews,
    });
  } catch (err) {
    console.error("Homepage error:", err);
    res.status(500).send("Chyba homepage.");
  }
});

module.exports = router;