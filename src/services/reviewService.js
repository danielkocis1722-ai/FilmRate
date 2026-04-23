const pool = require("../config/db");
const tmdbService = require("./tmdbService");

const REVIEWS_PER_PAGE = 5;
const FALLBACK_POSTER = "https://placehold.co/180x260?text=Poster";
const FALLBACK_MOVIE_TITLE = "Neznámy film";

async function loadReviewsPage(queryParams) {
  const search = queryParams.q?.trim() || "";
  const spoilers = queryParams.spoilers || "no";
  const minRating = queryParams.minRating || "";
  const page = Number(queryParams.page) || 1;
  const offset = (page - 1) * REVIEWS_PER_PAGE;

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

  const { whereClause, values } = buildReviewFilters({
    matchedMovieIds,
    spoilers,
    minRating,
  });

  const totalPages = await getReviewTotalPages(whereClause, values);

  const reviews = await getPaginatedReviews(whereClause, values, {
    limit: REVIEWS_PER_PAGE,
    offset,
  });

  const reviewsWithMovieInfo = await attachMovieInfoToReviews(reviews);

  return {
    reviews: reviewsWithMovieInfo,
    search,
    spoilers,
    minRating,
    currentPage: page,
    totalPages,
  };
}

function buildReviewFilters({ matchedMovieIds, spoilers, minRating }) {
  const conditions = [];
  const values = [];

  if (matchedMovieIds.length > 0) {
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

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return { whereClause, values };
}

async function getReviewTotalPages(whereClause, values) {
  const countQuery = `
    SELECT COUNT(*) AS total
    FROM reviews
    ${whereClause}
  `;

  const countResult = await pool.query(countQuery, values);
  const totalCount = Number(countResult.rows[0].total);

  return Math.ceil(totalCount / REVIEWS_PER_PAGE);
}

async function getPaginatedReviews(whereClause, values, { limit, offset }) {
  const paginatedValues = [...values, limit, offset];

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
  return result.rows;
}

async function attachMovieInfoToReviews(reviews) {
  const movieIds = reviews.map((review) => Number(review.tmdb_movie_id));
  const moviesInfoMap = await tmdbService.getMoviesInfoMap(movieIds);

  return reviews.map((review) => ({
    ...review,
    movieTitle:
      moviesInfoMap[Number(review.tmdb_movie_id)]?.title ||
      FALLBACK_MOVIE_TITLE,
    moviePoster:
      moviesInfoMap[Number(review.tmdb_movie_id)]?.poster || FALLBACK_POSTER,
  }));
}

async function getReviewById(reviewId) {
  const result = await pool.query("SELECT * FROM reviews WHERE id = $1", [
    reviewId,
  ]);

  return result.rows[0] || null;
}

async function getReviewOwnerById(reviewId) {
  const result = await pool.query("SELECT user_id FROM reviews WHERE id = $1", [
    reviewId,
  ]);

  return result.rows[0] || null;
}

async function getReviewWithAuthor(reviewId) {
  const result = await pool.query(
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

  return result.rows[0] || null;
}

async function getCommentsByReviewId(reviewId) {
  const result = await pool.query(
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

  return result.rows;
}

async function getVoteCounts(reviewId) {
  const result = await pool.query(
    `
    SELECT
      COUNT(CASE WHEN vote_type = 'helpful' THEN 1 END) AS helpful_count,
      COUNT(CASE WHEN vote_type = 'not_helpful' THEN 1 END) AS not_helpful_count
    FROM review_votes
    WHERE review_id = $1
    `,
    [reviewId],
  );

  return {
    helpfulCount: Number(result.rows[0].helpful_count || 0),
    notHelpfulCount: Number(result.rows[0].not_helpful_count || 0),
  };
}

async function getReviewVoteTarget(reviewId) {
  const result = await pool.query(
    "SELECT id, user_id, tmdb_movie_id FROM reviews WHERE id = $1",
    [reviewId],
  );

  return result.rows[0] || null;
}

async function saveVote({ reviewId, userId, voteType }) {
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
      await pool.query("UPDATE review_votes SET vote_type = $1 WHERE id = $2", [
        voteType,
        existingVote.id,
      ]);
    }
  }

  return getVoteCounts(reviewId);
}

module.exports = {
  loadReviewsPage,
  getReviewById,
  getReviewOwnerById,
  getReviewWithAuthor,
  getCommentsByReviewId,
  getVoteCounts,
  getReviewVoteTarget,
  saveVote,
};
