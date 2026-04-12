const axios = require("axios");

const BASE_URL = "https://api.themoviedb.org/3";

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

async function searchMovies(query) {
  return tmdbGet("/search/movie", {
    query,
    language: "sk-SK",
  });
}

async function discoverMovies(params = {}) {
  return tmdbGet("/discover/movie", {
    language: "sk-SK",
    sort_by: "popularity.desc",
    ...params,
  });
}

async function getMovieDetails(movieId) {
  return tmdbGet(`/movie/${movieId}`, {
    language: "sk-SK",
  });
}

async function getMovieCredits(movieId) {
  return tmdbGet(`/movie/${movieId}/credits`, {
    language: "sk-SK",
  });
}

function buildImageUrl(config, size, filePath) {
  if (!filePath) return null;
  return `${config.images.secure_base_url}${size}${filePath}`;
}

async function getMoviesInfoMap(movieIds) {
  const uniqueIds = [...new Set(movieIds.filter(Boolean))];
  const config = await getConfig();

  const results = await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        const movie = await getMovieDetails(id);
        return [
          id,
          {
            title: movie.title,
            poster:
              buildImageUrl(config, "w500", movie.poster_path) ||
              "https://placehold.co/180x260?text=Poster",
          },
        ];
      } catch (error) {
        console.error(
          `TMDb title fetch error for movie ${id}:`,
          error.response?.data || error.message,
        );
        return [
          id,
          {
            title: "Neznámy film",
            poster: "https://placehold.co/180x260?text=Poster",
          },
        ];
      }
    }),
  );
  return Object.fromEntries(results);
}
async function getMovieGenres() {
  return tmdbGet("/genre/movie/list", {
    language: "sk-SK",
  });
}

module.exports = {
  getConfig,
  searchMovies,
  discoverMovies,
  getMovieDetails,
  getMovieCredits,
  buildImageUrl,
  getMoviesInfoMap,
  getMovieGenres,
};
