const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/authMiddleware");
const pool = require("../config/db");
const tmdbService = require("../services/tmdbService");
const path = require("path");
const multer = require("multer");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/uploads/avatars");
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `avatar-${req.session.user.id}-${Date.now()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Povolené sú len JPG, PNG a WEBP obrázky."), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2 MB
  },
});

async function loadProfileDataByUserId(userId) {
  const userResult = await pool.query(
    `
  SELECT id, username, email, role, created_at, bio, favorite_genre, avatar_url
  FROM users
  WHERE id = $1
  `,
    [userId],
  );

  if (userResult.rows.length === 0) {
    return null;
  }

  const reviewsResult = await pool.query(
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
    WHERE reviews.user_id = $1
    GROUP BY reviews.id, users.username, users.avatar_url
    ORDER BY reviews.created_at DESC
    `,
    [userId],
  );

  const profileUser = userResult.rows[0];
  const reviews = reviewsResult.rows;

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

  const stats = {
    reviewCount: reviewsWithMovieInfo.length,
    averageRating:
      reviewsWithMovieInfo.length > 0
        ? (
            reviewsWithMovieInfo.reduce(
              (sum, review) => sum + Number(review.rating),
              0,
            ) / reviewsWithMovieInfo.length
          ).toFixed(1)
        : "0.0",
    helpfulCount: reviewsWithMovieInfo.reduce(
      (sum, review) => sum + Number(review.helpful_count || 0),
      0,
    ),
  };

  return {
    profileUser,
    reviews: reviewsWithMovieInfo,
    stats,
  };
}

router.get("/profile", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const profileData = await loadProfileDataByUserId(userId);

    if (!profileData) {
      return res.status(404).send("Používateľ sa nenašiel.");
    }

    res.render("profile", {
      ...profileData,
      isOwnProfile: true,
    });
  } catch (err) {
    console.error("Load own profile error:", err);
    res.status(500).send("Chyba pri načítaní profilu.");
  }
});

router.get("/users/:username", async (req, res) => {
  try {
    const username = req.params.username;

    const userResult = await pool.query(
      `
      SELECT id
      FROM users
      WHERE username = $1
      `,
      [username],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).send("Používateľ sa nenašiel.");
    }

    const profileUserId = userResult.rows[0].id;
    const profileData = await loadProfileDataByUserId(profileUserId);

    if (!profileData) {
      return res.status(404).send("Používateľ sa nenašiel.");
    }

    const isOwnProfile =
      req.session.user && req.session.user.id === profileData.profileUser.id;

    res.render("profile", {
      ...profileData,
      isOwnProfile,
    });
  } catch (err) {
    console.error("Load public profile error:", err);
    res.status(500).send("Chyba pri načítaní profilu.");
  }
});

router.get("/profile/edit", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;

    const userResult = await pool.query(
      `
      SELECT id, username, email, role, created_at, bio, favorite_genre, avatar_url
      FROM users
      WHERE id = $1
      `,
      [userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).send("Používateľ sa nenašiel.");
    }

    res.render("edit-profile", {
      profileUser: userResult.rows[0],
    });
  } catch (err) {
    console.error("Load edit profile page error:", err);
    res.status(500).send("Chyba pri načítaní edit profilu.");
  }
});

router.post(
  "/profile/edit",
  requireAuth,
  upload.single("avatar"),
  async (req, res) => {
    try {
      const userId = req.session.user.id;
      const { bio, favoriteGenre } = req.body || {};

      let avatarUrl = null;

      if (req.file) {
        avatarUrl = `/uploads/avatars/${req.file.filename}`;
      }

      if (avatarUrl) {
        await pool.query(
          `
          UPDATE users
          SET bio = $1,
              favorite_genre = $2,
              avatar_url = $3
          WHERE id = $4
          `,
          [bio || null, favoriteGenre || null, avatarUrl, userId],
        );
      } else {
        await pool.query(
          `
          UPDATE users
          SET bio = $1,
              favorite_genre = $2
          WHERE id = $3
          `,
          [bio || null, favoriteGenre || null, userId],
        );
      }

      res.redirect("/profile");
    } catch (err) {
      console.error("Edit profile error:", err);
      res.status(500).send("Chyba pri ukladaní profilu.");
    }
  },
);
// TODO - if file too large, catch multer error and show message
// TODO - pridat moznost zmenit heslo
// TODO - vymazat fotku z disku pri nahrani novej

module.exports = router;
