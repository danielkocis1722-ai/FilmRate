const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/authMiddleware");
const tmdbService = require("../services/tmdbService");
const pool = require("../config/db");
const {
  loadReviewsPage,
  getReviewById,
  getReviewOwnerById,
  getReviewWithAuthor,
  getCommentsByReviewId,
  getReviewVoteTarget,
  saveVote,
} = require("../services/reviewService");

router.get("/reviews", async (req, res) => {
  try {
    const reviewsPage = await loadReviewsPage(req.query);

    res.render("reviews", reviewsPage);
  } catch (err) {
    console.error("Load reviews error:", err);
    res.status(500).send("Chyba pri načítaní recenzií.");
  }
});

router.get("/api/reviews", async (req, res) => {
  try {
    const reviewsPage = await loadReviewsPage(req.query);

    res.json({
      reviews: reviewsPage.reviews,
      currentPage: reviewsPage.currentPage,
      totalPages: reviewsPage.totalPages,
    });
  } catch (err) {
    console.error("Load reviews API error:", err);
    res.status(500).json({ error: "Chyba pri načítaní recenzií." });
  }
});

router.get("/reviews/create", requireAuth, (req, res) => {
  res.render("create-review", { selectedMovie: null });
});

router.get("/movies/:id/review/create", requireAuth, async (req, res) => {
  const selectedMovieId = Number(req.params.id);

  try {
    const movie = await tmdbService.getMovieDetails(selectedMovieId);

    res.render("create-review", {
      selectedMovie: {
        id: movie.id,
        title: movie.title,
        year: movie.release_date ? movie.release_date.slice(0, 4) : "",
      },
    });
  } catch (err) {
    console.error(
      "Load selected movie error:",
      err.response?.data || err.message,
    );

    res.render("create-review", {
      selectedMovie: null,
    });
  }
});

router.get("/api/movies/search", requireAuth, async (req, res) => {
  const query = req.query.q?.trim();

  if (!query || query.length < 2) {
    return res.json([]);
  }

  try {
    const data = await tmdbService.searchMovies(query);

    const movies = data.results.slice(0, 8).map((movie) => ({
      id: movie.id,
      title: movie.title,
      year: movie.release_date ? movie.release_date.slice(0, 4) : "",
    }));

    res.json(movies);
  } catch (err) {
    console.error("TMDb search error:", err.response?.data || err.message);
    res.status(500).json({ error: "Chyba pri vyhľadávaní filmov." });
  }
});

router.get("/reviews/:id/edit", requireAuth, async (req, res) => {
  const reviewId = Number(req.params.id);
  const userId = req.session.user.id;

  try {
    const review = await getReviewById(reviewId);

    if (!review || review.user_id !== userId) {
      return res.status(403).send("Nemáš oprávnenie.");
    }

    res.render("edit-review", { review });
  } catch (err) {
    console.error("Load edit review error:", err);
    res.status(500).send("Chyba pri načítaní recenzie.");
  }
});

router.get("/reviews/:id/comments", requireAuth, async (req, res) => {
  const reviewId = Number(req.params.id);

  try {
    const review = await getReviewWithAuthor(reviewId);

    if (!review) {
      return res.status(404).send("Recenzia nenájdená.");
    }

    const comments = await getCommentsByReviewId(reviewId);

    res.render("review-comments", {
      review,
      comments,
      user: req.session.user || null,
    });
  } catch (err) {
    console.error("Load comments error:", err);
    res.status(500).send("Chyba pri načítaní komentárov.");
  }
});

router.post("/reviews/create", requireAuth, async (req, res) => {
  const { movieId, rating, reviewTitle, reviewText, containsSpoilers } =
    req.body;

  if (!movieId || !rating || !reviewText) {
    return res.status(400).send("Vyplň povinné polia.");
  }

  try {
    await pool.query(
      `
        INSERT INTO reviews (user_id, tmdb_movie_id, title, review_text, rating, contains_spoilers)
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
      [
        req.session.user.id,
        Number(movieId),
        reviewTitle || null,
        reviewText,
        Number(rating),
        containsSpoilers ? true : false,
      ],
    );

    res.redirect("/reviews");
  } catch (err) {
    console.error("Create review error:", err);
    res.status(500).send("Chyba pri ukladaní recenzie.");
  }
});

router.post("/reviews/:id/delete", requireAuth, async (req, res) => {
  const reviewId = Number(req.params.id);
  const userId = req.session.user.id;

  try {
    const reviewOwner = await getReviewOwnerById(reviewId);

    if (!reviewOwner) {
      return res.status(404).send("Recenzia neexistuje.");
    }

    if (reviewOwner.user_id !== userId) {
      return res.status(403).send("Nemáš oprávnenie.");
    }

    await pool.query("DELETE FROM reviews WHERE id = $1", [reviewId]);

    res.redirect("/profile");
  } catch (err) {
    console.error("Delete review error:", err);
    res.status(500).send("Chyba pri mazaní.");
  }
});

router.post("/reviews/:id/edit", requireAuth, async (req, res) => {
  const reviewId = Number(req.params.id);
  const userId = req.session.user.id;
  const { reviewTitle, reviewText, rating, containsSpoilers } = req.body;

  try {
    const reviewOwner = await getReviewOwnerById(reviewId);

    if (!reviewOwner || reviewOwner.user_id !== userId) {
      return res.status(403).send("Nemáš oprávnenie.");
    }

    await pool.query(
      `
        UPDATE reviews
        SET title = $1,
            review_text = $2,
            rating = $3,
            contains_spoilers = $4
        WHERE id = $5
        `,
      [
        reviewTitle || null,
        reviewText,
        Number(rating),
        containsSpoilers ? true : false,
        reviewId,
      ],
    );

    res.redirect("/profile");
  } catch (err) {
    console.error("Edit review error:", err);
    res.status(500).send("Chyba pri úprave recenzie.");
  }
});

router.post("/api/reviews/:id/vote", requireAuth, async (req, res) => {
  const reviewId = Number(req.params.id);
  const userId = req.session.user.id;
  const { voteType } = req.body;

  if (!["helpful", "not_helpful"].includes(voteType)) {
    return res.status(400).json({ error: "Neplatný typ hlasu." });
  }

  try {
    const review = await getReviewVoteTarget(reviewId);

    if (!review) {
      return res.status(404).json({ error: "Recenzia sa nenašla." });
    }

    if (review.user_id === userId) {
      return res
        .status(403)
        .json({ error: "Na vlastnú recenziu nemôžeš hlasovať." });
    }

    const counts = await saveVote({ reviewId, userId, voteType });

    return res.json({
      success: true,
      helpfulCount: counts.helpfulCount,
      notHelpfulCount: counts.notHelpfulCount,
    });
  } catch (err) {
    console.error("AJAX vote error:", err);
    return res.status(500).json({ error: "Chyba pri hlasovaní." });
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
    const review = await getReviewVoteTarget(reviewId);

    if (!review) {
      return res.status(404).send("Recenzia sa nenašla.");
    }

    if (review.user_id === userId) {
      return res.status(403).send("Na vlastnú recenziu nemôžeš hlasovať.");
    }

    await saveVote({ reviewId, userId, voteType });

    const redirectTo = req.get("referer") || `/movies/${review.tmdb_movie_id}`;
    res.redirect(redirectTo);
  } catch (err) {
    console.error("Vote error:", err);
    res.status(500).send("Chyba pri hlasovaní.");
  }
});

router.post("/reviews/:id/comments", requireAuth, async (req, res) => {
  const reviewId = Number(req.params.id);
  const commentText = req.body.commentText?.trim();

  if (!commentText) {
    return res.status(400).send("Komentár nemôže byť prázdny.");
  }

  try {
    await pool.query(
      `
        INSERT INTO review_comments (review_id, user_id, comment_text)
        VALUES ($1, $2, $3)
        `,
      [reviewId, req.session.user.id, commentText],
    );

    res.redirect(`/reviews/${reviewId}/comments`);
  } catch (err) {
    console.error("Create comment error:", err);
    res.status(500).send("Chyba pri ukladaní komentára.");
  }
});

module.exports = router;
