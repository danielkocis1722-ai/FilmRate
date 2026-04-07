const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/authMiddleware");
const pool = require("../config/db");
const tmdbService = require("../services/tmdbService");

router.get("/profile", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const userResult = await pool.query(
      `
      SELECT id, username, email, role, created_at
      FROM users
      WHERE id = $1
      `,
      [userId],
    );
    if (userResult.rows.length === 0) {
      return res.status(404).send("Používateľ sa nenašiel.");
    }

    const reviewsResult = await pool.query(
      `
  SELECT
    reviews.id,
    reviews.user_id,
    reviews.tmdb_movie_id,
    reviews.title,
    reviews.review_text,
    reviews.rating,
    reviews.contains_spoilers,
    reviews.created_at,
    users.username,
    COUNT(CASE WHEN review_votes.vote_type = 'helpful' THEN 1 END) AS helpful_count,
    COUNT(CASE WHEN review_votes.vote_type = 'not_helpful' THEN 1 END) AS not_helpful_count
  FROM reviews
  JOIN users ON reviews.user_id = users.id
  LEFT JOIN review_votes ON reviews.id = review_votes.review_id
  WHERE reviews.user_id = $1
  GROUP BY reviews.id, users.username
  ORDER BY reviews.created_at DESC
  `,
      [userId],
    );

    const user = userResult.rows[0];
    const reviews = reviewsResult.rows;

    const movieIds = reviews.map((review) => Number(review.tmdb_movie_id));
    const movieTitlesMap = await tmdbService.getMovieTitlesMap(movieIds);

    const reviewsWithMovieTitles = reviews.map((review) => ({
      ...review,
      movieTitle:
        movieTitlesMap[Number(review.tmdb_movie_id)] || "Neznámy film",
    }));

    const stats = {
      reviewCount: reviewsWithMovieTitles.length,
      averageRating:
        reviewsWithMovieTitles.length > 0
          ? (
              reviewsWithMovieTitles.reduce(
                (sum, review) => sum + Number(review.rating),
                0,
              ) / reviewsWithMovieTitles.length
            ).toFixed(1)
          : "0.0",
      helpfulCount: reviewsWithMovieTitles.reduce(
        (sum, review) => sum + Number(review.helpful_count || 0),
        0,
      ),
    };

    res.render("profile", {
      profileUser: user,
      reviews: reviewsWithMovieTitles,
      stats,
    });
  } catch (err) {
    console.error("Load profile error:", err);
    res.status(500).send("Chyba pri načítaní profilu.");
  }
});

module.exports = router;
