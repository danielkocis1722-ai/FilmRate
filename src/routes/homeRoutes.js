const express = require("express");
const router = express.Router();
const tmdbService = require("../services/tmdbService");
const pool = require("../config/db");

router.get("/", async (req, res) => {
  try {
    const now = new Date();
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(now.getDate() - 14);

    const formatDate = (date) => date.toISOString().split("T")[0];

    const [config, moviesData, reviewsResult] = await Promise.all([
      tmdbService.getConfig(),
      tmdbService.discoverMovies({
        sort_by: "popularity.desc",
        "primary_release_date.gte": formatDate(twoWeeksAgo),
        "primary_release_date.lte": formatDate(now),
        "vote_count.gte": 100,
      }),
      pool.query(`
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
      COUNT(CASE WHEN review_votes.vote_type = 'helpful' THEN 1 END) AS helpful_count,
      COUNT(CASE WHEN review_votes.vote_type = 'not_helpful' THEN 1 END) AS not_helpful_count
    FROM reviews
    JOIN users ON reviews.user_id = users.id
    LEFT JOIN review_votes ON reviews.id = review_votes.review_id
    WHERE reviews.contains_spoilers = false
    GROUP BY reviews.id, users.username, users.avatar_url
    ORDER BY reviews.created_at DESC
    LIMIT 2
  `),
    ]);

    const reviews = reviewsResult.rows;

    const movieIds = reviews.map((r) => Number(r.tmdb_movie_id));
    const moviesInfoMap = await tmdbService.getMoviesInfoMap(movieIds);

    const reviewsWithMovieInfo = reviews.map((review) => ({
      ...review,
      movieTitle:
        moviesInfoMap[Number(review.tmdb_movie_id)]?.title || "Neznámy film",
      moviePoster:
        moviesInfoMap[Number(review.tmdb_movie_id)]?.poster ||
        "https://placehold.co/180x260?text=Poster",
      avatar: review.avatar_url || "https://placehold.co/48x48?text=AV",
    }));

    const baseMovies = moviesData.results.slice(0, 4);

    const latestMovies = await Promise.all(
      baseMovies.map(async (movie) => {
        const credits = await tmdbService.getMovieCredits(movie.id);

        const director =
          credits.crew.find((person) => person.job === "Director")?.name ||
          "Neznámy režisér";

        const cast = credits.cast.slice(0, 3).map((actor) => actor.name);

        return {
          id: movie.id,
          title: movie.title,
          year: movie.release_date?.slice(0, 4) || "—",
          director,
          cast,
          rating: Number(movie.vote_average || 0).toFixed(1),
          poster:
            tmdbService.buildImageUrl(config, "w500", movie.poster_path) ||
            "https://placehold.co/320x480?text=Poster",
          overview: movie.overview || "Bez popisu.",
        };
      }),
    );
    res.render("index", {
      latestMovies,
      latestReviews: reviewsWithMovieInfo,
    });
  } catch (err) {
    console.error("Homepage error:", err);
    res.status(500).send("Chyba homepage.");
  }
});

module.exports = router;
