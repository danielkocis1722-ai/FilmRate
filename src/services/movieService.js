const pool = require("../config/db");
const tmdbService = require("./tmdbService");

const MOVIE_POSTER_FALLBACK = "https://placehold.co/220x300?text=Poster";
const MOVIE_DETAIL_POSTER_FALLBACK = "https://placehold.co/320x480?text=Poster";
const MOVIE_BACKDROP_FALLBACK = "https://placehold.co/1600x900?text=Backdrop";
const ACTOR_FALLBACK = "https://placehold.co/220x260?text=Actor";
const MIN_VOTE_COUNT = 200;

async function loadMoviesPage(query) {
  const search = query.q?.trim() || "";
  const genre = query.genre || "";
  const minRating = query.minRating || "";
  const runtime = query.runtime || "";
  const sort = query.sort || "popularity.desc";
  const year = query.year?.trim() || "";
  const page = Number(query.page) || 1;

  const [config, genresData] = await Promise.all([
    tmdbService.getConfig(),
    tmdbService.getMovieGenres(),
  ]);

  let data;

  if (search) {
    data = await tmdbService.searchMovies(search, page);
  } else {
    const discoverParams = buildDiscoverParams({
      genre,
      minRating,
      runtime,
      sort,
      year,
      page,
    });

    data = await tmdbService.discoverMovies(discoverParams);
  }

  const movies = data.results.map((movie) => mapMovieCard(movie, config));

  return {
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
  };
}

function buildDiscoverParams({ genre, minRating, runtime, sort, year, page }) {
  const discoverParams = {
    sort_by: sort,
    page,
  };

  if (genre) {
    discoverParams.with_genres = genre;
  }

  if (minRating) {
    discoverParams["vote_average.gte"] = Number(minRating);
    discoverParams["vote_count.gte"] = MIN_VOTE_COUNT;
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

  return discoverParams;
}

function mapMovieCard(movie, config) {
  return {
    id: movie.id,
    title: movie.title,
    releaseDate: movie.release_date,
    rating: movie.vote_average,
    poster:
      tmdbService.buildImageUrl(config, "w500", movie.poster_path) ||
      MOVIE_POSTER_FALLBACK,
    overview: movie.overview,
  };
}

async function getMovieReviews(movieId) {
  const result = await pool.query(
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
      COUNT(DISTINCT CASE WHEN review_votes.vote_type = 'helpful' THEN review_votes.id END) AS helpful_count,
      COUNT(DISTINCT CASE WHEN review_votes.vote_type = 'not_helpful' THEN review_votes.id END) AS not_helpful_count,
      COUNT(DISTINCT review_comments.id) AS comments_count
    FROM reviews
    JOIN users ON reviews.user_id = users.id
    LEFT JOIN review_votes ON reviews.id = review_votes.review_id
    LEFT JOIN review_comments ON reviews.id = review_comments.review_id
    WHERE reviews.tmdb_movie_id = $1
    GROUP BY reviews.id, users.username, users.avatar_url
    ORDER BY reviews.created_at DESC
    `,
    [movieId],
  );

  return result.rows;
}

function attachMovieInfoToReviews(reviews, details, config) {
  return reviews.map((review) => ({
    ...review,
    movieTitle: details.title,
    moviePoster:
      tmdbService.buildImageUrl(config, "w500", details.poster_path) ||
      MOVIE_POSTER_FALLBACK,
  }));
}

function buildMovieDetail(details, credits, config, reviews) {
  const director =
    credits.crew.find((person) => person.job === "Director")?.name ||
    "Neznámy režisér";

  return {
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
      MOVIE_DETAIL_POSTER_FALLBACK,
    backdrop:
      tmdbService.buildImageUrl(config, "original", details.backdrop_path) ||
      MOVIE_BACKDROP_FALLBACK,
    cast: credits.cast.slice(0, 6).map((actor) => ({
      name: actor.name,
      role: actor.character,
      image:
        tmdbService.buildImageUrl(config, "w300", actor.profile_path) ||
        ACTOR_FALLBACK,
    })),
    reviews,
  };
}

module.exports = {
  loadMoviesPage,
  getMovieReviews,
  attachMovieInfoToReviews,
  buildMovieDetail,
};
