const express = require("express");
const router = express.Router();
const tmdbService = require("../services/tmdbService");
const {
  loadMoviesPage,
  getMovieReviews,
  attachMovieInfoToReviews,
  buildMovieDetail,
} = require("../services/movieService");

router.get("/movies", async (req, res) => {
  try {
    const moviesPage = await loadMoviesPage(req.query);

    res.render("movies", moviesPage);
  } catch (err) {
    console.error("TMDb movies error:", err.response?.data || err.message);
    res.status(500).send("Chyba pri načítaní filmov z TMDb.");
  }
});

router.get("/api/movies", async (req, res) => {
  try {
    const moviesPage = await loadMoviesPage(req.query);

    res.json({
      movies: moviesPage.movies,
      currentPage: moviesPage.currentPage,
      totalPages: moviesPage.totalPages,
    });
  } catch (err) {
    console.error("TMDb movies API error:", err.response?.data || err.message);
    res.status(500).json({ error: "Chyba pri načítaní filmov." });
  }
});

router.get("/movies/:id", async (req, res) => {
  const movieId = Number(req.params.id);

  try {
    const [config, details, credits, reviews] = await Promise.all([
      tmdbService.getConfig(),
      tmdbService.getMovieDetails(movieId),
      tmdbService.getMovieCredits(movieId),
      getMovieReviews(movieId),
    ]);

    const reviewsWithExtras = attachMovieInfoToReviews(reviews, details, config);
    const movie = buildMovieDetail(details, credits, config, reviewsWithExtras);

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

