const express = require("express");
const router = express.Router();
const tmdbService = require("../services/tmdbService");
const pool = require("../config/db");

router.get("/movies", async (req, res) => {
  try {
    const search = req.query.q?.trim() || "";

    const [config, data] = await Promise.all([
      tmdbService.getConfig(),
      search ? tmdbService.searchMovies(search) : tmdbService.discoverMovies(),
    ]);

    const movies = data.results.map((movie) => ({
      id: movie.id,
      title: movie.title,
      releaseDate: movie.release_date,
      rating: movie.vote_average,
      poster:
        tmdbService.buildImageUrl(config, "w500", movie.poster_path) ||
        "https://placehold.co/220x300?text=Poster",
      overview: movie.overview,
    }));

    res.render("movies", { movies, search });
  } catch (err) {
    console.error("TMDb movies error:", err.response?.data || err.message);
    res.status(500).send("Chyba pri načítaní filmov z TMDb.");
  }
});

router.get("/movies/:id", async (req, res) => {
  const movieId = Number(req.params.id);

  try {
    const [config, details, credits, reviewsResult] = await Promise.all([
      tmdbService.getConfig(),
      tmdbService.getMovieDetails(movieId),
      tmdbService.getMovieCredits(movieId),
      pool.query(
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
        WHERE reviews.tmdb_movie_id = $1
        GROUP BY reviews.id, users.username
        ORDER BY reviews.created_at DESC
        `,
        [movieId],
      ),
    ]);

    const director =
      credits.crew.find((person) => person.job === "Director")?.name ||
      "Neznámy režisér";

    const movie = {
      id: details.id,
      title: details.title,
      director,
      year: details.release_date?.slice(0, 4) || "—",
      duration: details.runtime
        ? `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}min`
        : "—",
      rating: details.vote_average?.toFixed(1) || "0.0",
      description: details.overview,
      poster:
        tmdbService.buildImageUrl(config, "w500", details.poster_path) ||
        "https://placehold.co/320x480?text=Poster",
      backdrop:
        tmdbService.buildImageUrl(config, "original", details.backdrop_path) ||
        "https://placehold.co/1600x900?text=Backdrop",
      cast: credits.cast.slice(0, 6).map((actor) => ({
        name: actor.name,
        role: actor.character,
        image:
          tmdbService.buildImageUrl(config, "w300", actor.profile_path) ||
          "https://placehold.co/220x260?text=Actor",
      })),
      reviews: reviewsResult.rows,
    };

    res.render("movie-detail", { movie });
  } catch (err) {
    console.error(
      "TMDb movie detail error:",
      err.response?.data || err.message,
    );
    res.status(500).send("Chyba pri načítaní detailu filmu.");
  }
});

module.exports = router;
