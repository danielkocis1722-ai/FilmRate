const axios = require("axios");

const BASE_URL = "https://api.themoviedb.org/3";
const DEFAULT_LANGUAGE = "sk-SK";
const FALLBACK_LANGUAGE = "en-US";

const FALLBACKS = {
  movieTitle: "Neznámy film",
  poster: "https://placehold.co/180x260?text=Poster",
};

async function tmdbGet(endpoint, params = {}) {
  const response = await axios.get(`${BASE_URL}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${process.env.TMDB_BEARER_TOKEN}`,
      Accept: "application/json",
    },
    params,
  });

  return response.data;
}

async function getConfig() {
  return tmdbGet("/configuration");
}

async function searchMovies(query, page = 1) {
  return tmdbGet("/search/movie", {
    query,
    language: DEFAULT_LANGUAGE,
    page,
  });
}

async function discoverMovies(params = {}) {
  return tmdbGet("/discover/movie", {
    language: DEFAULT_LANGUAGE,
    sort_by: "popularity.desc",
    "vote_count.gte": 60,
    ...params,
  });
}

async function getMovieDetails(id) {
  let data = await tmdbGet(`/movie/${id}`, {
    language: DEFAULT_LANGUAGE,
  });

  if (!data.overview) {
    data = await tmdbGet(`/movie/${id}`, {
      language: FALLBACK_LANGUAGE,
    });
  }

  return data;
}

async function getMovieCredits(movieId) {
  return tmdbGet(`/movie/${movieId}/credits`, {
    language: DEFAULT_LANGUAGE,
  });
}

async function getMovieGenres() {
  return tmdbGet("/genre/movie/list", {
    language: DEFAULT_LANGUAGE,
  });
}

function buildImageUrl(config, size, filePath) {
  if (!filePath) return null;
  return `${config.images.secure_base_url}${size}${filePath}`;
}

function mapMovieInfo(movie, config) {
  return {
    title: movie.title || FALLBACKS.movieTitle,
    poster:
      buildImageUrl(config, "w500", movie.poster_path) || FALLBACKS.poster,
  };
}

async function getMoviesInfoMap(movieIds) {
  const uniqueIds = [...new Set(movieIds.filter(Boolean))];

  if (uniqueIds.length === 0) {
    return {};
  }

  const config = await getConfig();

  const results = await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        const movie = await getMovieDetails(id);
        return [id, mapMovieInfo(movie, config)];
      } catch (error) {
        console.error(
          `TMDb title fetch error for movie ${id}:`,
          error.response?.data || error.message,
        );

        return [
          id,
          {
            title: FALLBACKS.movieTitle,
            poster: FALLBACKS.poster,
          },
        ];
      }
    }),
  );

  return Object.fromEntries(results);
}

module.exports = {
  getConfig,
  searchMovies,
  discoverMovies,
  getMovieDetails,
  getMovieCredits,
  getMovieGenres,
  buildImageUrl,
  getMoviesInfoMap,
};
