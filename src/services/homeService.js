const pool = require("../config/db");
const tmdbService = require("./tmdbService");

const HOMEPAGE_REVIEW_LIMIT = 2;
const HOMEPAGE_MOVIE_LIMIT = 4;
const HOMEPAGE_VOTE_COUNT_MIN = 100;

const FALLBACKS = {
  movieTitle: "Neznámy film",
  reviewPoster: "https://placehold.co/180x260?text=Poster",
  avatar: "https://placehold.co/48x48?text=AV",
  moviePoster: "https://placehold.co/320x480?text=Poster",
};

function formatDate(date) {
  return date.toISOString().split("T")[0];
}

function getHomepageDateRange() {
  const now = new Date();
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(now.getDate() - 14);

  return {
    now,
    twoWeeksAgo,
    nowFormatted: formatDate(now),
    twoWeeksAgoFormatted: formatDate(twoWeeksAgo),
  };
}

async function getLatestReviews() {
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
    WHERE reviews.contains_spoilers = false
    GROUP BY reviews.id, users.username, users.avatar_url
    ORDER BY reviews.created_at DESC
    LIMIT $1
    `,
    [HOMEPAGE_REVIEW_LIMIT],
  );

  return result.rows;
}

async function attachMovieInfoToReviews(reviews) {
  const movieIds = reviews.map((review) => Number(review.tmdb_movie_id));
  const moviesInfoMap = await tmdbService.getMoviesInfoMap(movieIds);

  return reviews.map((review) => ({
    ...review,
    movieTitle:
      moviesInfoMap[Number(review.tmdb_movie_id)]?.title || FALLBACKS.movieTitle,
    moviePoster:
      moviesInfoMap[Number(review.tmdb_movie_id)]?.poster ||
      FALLBACKS.reviewPoster,
    avatar: review.avatar_url || FALLBACKS.avatar,
  }));
}

async function getLatestMovies() {
  const { nowFormatted, twoWeeksAgoFormatted } = getHomepageDateRange();

  const [config, moviesData] = await Promise.all([
    tmdbService.getConfig(),
    tmdbService.discoverMovies({
      sort_by: "popularity.desc",
      "primary_release_date.gte": twoWeeksAgoFormatted,
      "primary_release_date.lte": nowFormatted,
      "vote_count.gte": HOMEPAGE_VOTE_COUNT_MIN,
    }),
  ]);

  const baseMovies = moviesData.results.slice(0, HOMEPAGE_MOVIE_LIMIT);

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
          FALLBACKS.moviePoster,
        overview: movie.overview || "Bez popisu.",
      };
    }),
  );

  return latestMovies;
}

module.exports = {
  getLatestReviews,
  attachMovieInfoToReviews,
  getLatestMovies,
};