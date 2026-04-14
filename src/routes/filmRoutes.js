const express = require("express");
const router = express.Router();
const tmdbService = require("../services/tmdbService");
const pool = require("../config/db");

router.get("/movies", async (req, res) => {
  try {
    const search = req.query.q?.trim() || "";
    const genre = req.query.genre || "";
    const minRating = req.query.minRating || "";
    const runtime = req.query.runtime || "";
    const sort = req.query.sort || "popularity.desc";
    const year = req.query.year?.trim() || "";
    const page = Number(req.query.page) || 1;

    const [config, genresData] = await Promise.all([
      tmdbService.getConfig(),
      tmdbService.getMovieGenres(),
    ]);

    let data;

    if (search) {
      data = await tmdbService.searchMovies(search);
    } else {
      const discoverParams = {
        sort_by: sort,
        page,
      };

      if (genre) {
        discoverParams.with_genres = genre;
      }

      if (minRating) {
        discoverParams["vote_average.gte"] = Number(minRating);
        discoverParams["vote_count.gte"] = 200;
      }

      if (year) {
        discoverParams.primary_release_year = Number(year);
      }

      if (runtime === "short") {
        discoverParams["with_runtime.lte"] = 90;
      } else if (runtime === "medium") {
        discoverParams["with_runtime.gte"] = 91;
        discoverParams["with_runtime.lte"] = 120;
      } else if (runtime === "long") {
        discoverParams["with_runtime.gte"] = 121;
      }

      data = await tmdbService.discoverMovies(discoverParams);
    }

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

    res.render("movies", {
      movies,
      search,
      genres: genresData.genres || [],
      filters: {
        genre,
        minRating,
        runtime,
        sort,
        year,
      },
      currentPage: data.page || page,
      totalPages: data.total_pages || 1,
    });
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
          users.avatar_url,
          COUNT(CASE WHEN review_votes.vote_type = 'helpful' THEN 1 END) AS helpful_count,
          COUNT(CASE WHEN review_votes.vote_type = 'not_helpful' THEN 1 END) AS not_helpful_count
        FROM reviews
        JOIN users ON reviews.user_id = users.id
        LEFT JOIN review_votes ON reviews.id = review_votes.review_id
        WHERE reviews.tmdb_movie_id = $1
        GROUP BY reviews.id, users.username, users.avatar_url
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
