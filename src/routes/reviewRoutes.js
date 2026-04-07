const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/authMiddleware");
const movies = require("../data/mockMovies");
const tmdbService = require("../services/tmdbService");
const pool = require("../config/db");

router.get("/reviews", async (req, res) => {
  try {
    const result = await pool.query(`
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
      GROUP BY reviews.id, users.username
      ORDER BY reviews.created_at DESC
    `);
    const reviews = result.rows;
    const movieIds = reviews.map((review) => Number(review.tmdb_movie_id));
    const movieTitlesMap = await tmdbService.getMovieTitlesMap(movieIds);

    const reviewsWithMovieTitles = reviews.map((review) => ({
      ...review,
      movieTitle:
        movieTitlesMap[Number(review.tmdb_movie_id)] || "Neznámy film",
    }));

    res.render("reviews", {
      reviews: reviewsWithMovieTitles,
    });
  } catch (err) {
    console.error("Load reviews error:", err);
    res.status(500).send("Chyba pri načítaní recenzií.");
  }
});

router.get("/reviews/create", requireAuth, (req, res) => {
  res.render("create-review", {
    movies,
    selectedMovieId: null,
  });
});

router.get("/movies/:id/review/create", requireAuth, (req, res) => {
  const selectedMovieId = Number(req.params.id);

  res.render("create-review", {
    movies,
    selectedMovieId,
  });
});

router.post("/reviews/create", requireAuth, async (req, res) => {
  const { movieId, rating, reviewTitle, reviewText, containsSpoilers } =
    req.body;

  if (!movieId || !rating || !reviewText) {
    return res.status(400).send("Vyplň povinné polia.");
  }

  try {
    const pool = require("../config/db");

    await pool.query(
      `INSERT INTO reviews (user_id, tmdb_movie_id, title, review_text, rating, contains_spoilers)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.session.user.id,
        Number(movieId),
        reviewTitle || null,
        reviewText,
        Number(rating),
        containsSpoilers ? true : false,
      ],
    );

    // redirect späť na film (lepší UX)
    res.redirect(`/movies/${movieId}`);
  } catch (err) {
    console.error("Create review error:", err);
    res.status(500).send("Chyba pri ukladaní recenzie.");
  }
});

router.post("/reviews/:id/vote", requireAuth, async (req, res) => {
  const reviewId = Number(req.params.id);
  const userId = req.session.user.id;
  const { voteType } = req.body;

  if (!["helpful", "not_helpful"].includes(voteType)) {
    return res.status(400).send("Neplatný typ hlasu.");
  }

  try {
    const reviewResult = await pool.query(
      "SELECT id, user_id, tmdb_movie_id FROM reviews WHERE id = $1",
      [reviewId],
    );

    if (reviewResult.rows.length === 0) {
      return res.status(404).send("Recenzia sa nenašla.");
    }

    const review = reviewResult.rows[0];

    if (review.user_id === userId) {
      return res.status(403).send("Na vlastnú recenziu nemôžeš hlasovať.");
    }

    const existingVoteResult = await pool.query(
      "SELECT id, vote_type FROM review_votes WHERE user_id = $1 AND review_id = $2",
      [userId, reviewId],
    );

    if (existingVoteResult.rows.length === 0) {
      await pool.query(
        "INSERT INTO review_votes (user_id, review_id, vote_type) VALUES ($1, $2, $3)",
        [userId, reviewId, voteType],
      );
    } else {
      const existingVote = existingVoteResult.rows[0];

      if (existingVote.vote_type !== voteType) {
        await pool.query(
          "UPDATE review_votes SET vote_type = $1 WHERE id = $2",
          [voteType, existingVote.id],
        );
      }
    }

    const redirectTo = req.get("referer") || `/movies/${review.tmdb_movie_id}`;
    res.redirect(redirectTo);
  } catch (err) {
    console.error("Vote error:", err);
    res.status(500).send("Chyba pri hlasovaní.");
  }
});

module.exports = router;
