const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { requireAdmin } = require("../middleware/adminMiddleware");

router.get("/admin", requireAdmin, (req, res) => {
  res.render("admin");
});

router.get("/admin/reviews", requireAdmin, async (req, res) => {
  const result = await pool.query(`
    SELECT reviews.*, users.username
    FROM reviews
    JOIN users ON reviews.user_id = users.id
    ORDER BY reviews.created_at DESC
  `);

  res.render("admin-reviews", {
    reviews: result.rows,
  });
});

router.post("/admin/reviews/:id/delete", requireAdmin, async (req, res) => {
  const reviewId = req.params.id;

  await pool.query("DELETE FROM reviews WHERE id = $1", [reviewId]);

  res.redirect("/admin/reviews");
});

router.get("/admin/users", requireAdmin, async (req, res) => {
  const result = await pool.query(`
    SELECT id, username, email, role, created_at
    FROM users
    ORDER BY created_at DESC
  `);

  res.render("admin-users", {
    users: result.rows,
  });
});

router.post("/admin/users/:id/delete", requireAdmin, async (req, res) => {
  const userId = req.params.id;

  await pool.query("DELETE FROM users WHERE id = $1", [userId]);

  res.redirect("/admin/users");
});

module.exports = router;
