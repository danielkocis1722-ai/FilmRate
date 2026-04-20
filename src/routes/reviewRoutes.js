const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/authMiddleware");
const tmdbService = require("../services/tmdbService");
const pool = require("../config/db");

async function loadReviewsPage(queryParams) {
  const search = queryParams.q?.trim() || "";
  const spoilers = queryParams.spoilers || "no";
  const minRating = queryParams.minRating || "";
  const page = Number(queryParams.page) || 1;
  const limit = 5;
  const offset = (page - 1) * limit;

  let matchedMovieIds = [];

  if (search) {
    const tmdbResults = await tmdbService.searchMovies(search);
    matchedMovieIds = tmdbResults.results.map((movie) => movie.id);

    if (matchedMovieIds.length === 0) {
      return {
        reviews: [],
        search,
        spoilers,
        minRating,
        currentPage: page,
        totalPages: 0,
      };
    }
  }

  const conditions = [];
  const values = [];

  if (search) {
    values.push(matchedMovieIds);
    conditions.push(`reviews.tmdb_movie_id = ANY($${values.length})`);
  }

  if (spoilers === "no") {
    conditions.push("reviews.contains_spoilers = false");
  } else if (spoilers === "yes") {
    conditions.push("reviews.contains_spoilers = true");
  }

  if (minRating) {
    values.push(Number(minRating));
    conditions.push(`reviews.rating >= $${values.length}`);
  }

  let whereClause = "";
  if (conditions.length > 0) {
    whereClause = `WHERE ${conditions.join(" AND ")}`;
  }

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM reviews
    ${whereClause}
  `;

  const countResult = await pool.query(countQuery, values);
  const totalCount = Number(countResult.rows[0].total);
  const totalPages = Math.ceil(totalCount / limit);

  const paginatedValues = [...values];
  paginatedValues.push(limit);
  paginatedValues.push(offset);

  const reviewsQuery = `
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
    users.avatar_url,
    COUNT(DISTINCT CASE WHEN review_votes.vote_type = 'helpful' THEN review_votes.id END) AS helpful_count,
    COUNT(DISTINCT CASE WHEN review_votes.vote_type = 'not_helpful' THEN review_votes.id END) AS not_helpful_count,
    COUNT(DISTINCT review_comments.id) AS comments_count
  FROM reviews
  JOIN users ON reviews.user_id = users.id
  LEFT JOIN review_votes ON reviews.id = review_votes.review_id
  LEFT JOIN review_comments ON reviews.id = review_comments.review_id
  ${whereClause}
  GROUP BY reviews.id, users.username, users.avatar_url
  ORDER BY reviews.created_at DESC
  LIMIT $${paginatedValues.length - 1}
  OFFSET $${paginatedValues.length}
`;

  const result = await pool.query(reviewsQuery, paginatedValues);

  const reviews = result.rows;
  const movieIds = reviews.map((review) => Number(review.tmdb_movie_id));
  const moviesInfoMap = await tmdbService.getMoviesInfoMap(movieIds);

  const reviewsWithMovieInfo = reviews.map((review) => ({
    ...review,
    movieTitle:
      moviesInfoMap[Number(review.tmdb_movie_id)]?.title || "Neznámy film",
    moviePoster:
      moviesInfoMap[Number(review.tmdb_movie_id)]?.poster ||
      "https://placehold.co/180x260?text=Poster",
  }));

  return {
    reviews: reviewsWithMovieInfo,
    search,
    spoilers,
    minRating,
    currentPage: page,
    totalPages,
  };
}

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
  res.render("create-review", {
    selectedMovie: null,
  });
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

  const result = await pool.query("SELECT * FROM reviews WHERE id = $1", [
    reviewId,
  ]);

  const review = result.rows[0];

  if (!review || review.user_id !== userId) {
    return res.status(403).send("Nemáš oprávnenie.");
  }

  res.render("edit-review", { review });
});

router.get("/reviews/:id/comments", requireAuth, async (req, res) => {
  const reviewId = Number(req.params.id);

  try {
    // recenzia
    const reviewResult = await pool.query(
      `
      SELECT
        reviews.*,
        users.username
      FROM reviews
      JOIN users ON reviews.user_id = users.id
      WHERE reviews.id = $1
    `,
      [reviewId],
    );

    if (reviewResult.rows.length === 0) {
      return res.status(404).send("Recenzia nenájdená.");
    }

    const review = reviewResult.rows[0];

    // komentáre
    const commentsResult = await pool.query(
      `
      SELECT
        review_comments.*,
        users.username
      FROM review_comments
      JOIN users ON review_comments.user_id = users.id
      WHERE review_comments.review_id = $1
      ORDER BY review_comments.created_at ASC
    `,
      [reviewId],
    );

    res.render("review-comments", {
      review,
      comments: commentsResult.rows,
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
    res.redirect(`/reviews`);
  } catch (err) {
    console.error("Create review error:", err);
    res.status(500).send("Chyba pri ukladaní recenzie.");
  }
});

router.post("/reviews/:id/delete", requireAuth, async (req, res) => {
  const reviewId = Number(req.params.id);
  const userId = req.session.user.id;

  try {
    const result = await pool.query(
      "SELECT user_id FROM reviews WHERE id = $1",
      [reviewId],
    );

    if (result.rows.length === 0) {
      return res.status(404).send("Recenzia neexistuje.");
    }

    if (result.rows[0].user_id !== userId) {
      return res.status(403).send("Nemáš oprávnenie.");
    }

    await pool.query("DELETE FROM reviews WHERE id = $1", [reviewId]);

    res.redirect("/profile"); // alebo späť
  } catch (err) {
    console.error(err);
    res.status(500).send("Chyba pri mazaní.");
  }
});

router.post("/reviews/:id/edit", requireAuth, async (req, res) => {
  const reviewId = Number(req.params.id);
  const userId = req.session.user.id;
  const { reviewTitle, reviewText, rating, containsSpoilers } = req.body;

  const result = await pool.query("SELECT user_id FROM reviews WHERE id = $1", [
    reviewId,
  ]);

  if (!result.rows.length || result.rows[0].user_id !== userId) {
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
});

router.post("/api/reviews/:id/vote", requireAuth, async (req, res) => {
  const reviewId = Number(req.params.id);
  const userId = req.session.user.id;
  const { voteType } = req.body;

  if (!["helpful", "not_helpful"].includes(voteType)) {
    return res.status(400).json({ error: "Neplatný typ hlasu." });
  }

  try {
    const reviewResult = await pool.query(
      "SELECT id, user_id FROM reviews WHERE id = $1",
      [reviewId],
    );

    if (reviewResult.rows.length === 0) {
      return res.status(404).json({ error: "Recenzia sa nenašla." });
    }

    const review = reviewResult.rows[0];

    if (review.user_id === userId) {
      return res
        .status(403)
        .json({ error: "Na vlastnú recenziu nemôžeš hlasovať." });
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

    const countsResult = await pool.query(
      `
      SELECT
        COUNT(CASE WHEN vote_type = 'helpful' THEN 1 END) AS helpful_count,
        COUNT(CASE WHEN vote_type = 'not_helpful' THEN 1 END) AS not_helpful_count
      FROM review_votes
      WHERE review_id = $1
      `,
      [reviewId],
    );

    return res.json({
      success: true,
      helpfulCount: Number(countsResult.rows[0].helpful_count || 0),
      notHelpfulCount: Number(countsResult.rows[0].not_helpful_count || 0),
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

router.post("/reviews/:id/comments", requireAuth, async (req, res) => {
  const reviewId = Number(req.params.id);
  const { commentText } = req.body;

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
