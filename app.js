require("dotenv").config();
const express = require("express");
const path = require("path");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);

const pool = require("./src/config/db");
const authRoutes = require("./src/routes/authRoutes");
const reviewRoutes = require("./src/routes/reviewRoutes");
const profileRoutes = require("./src/routes/profileRoutes");
const filmRoutes = require("./src/routes/filmRoutes");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    store: new pgSession({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || "supersecret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
    },
  }),
);

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

app.get("/", (req, res) => {
  res.render("index", { user: req.session.user || null });
});

app.use("/", profileRoutes);

app.use("/", reviewRoutes);

app.use("/", authRoutes);

app.use("/", filmRoutes);

pool
  .connect()
  .then(() => {
    console.log("Connected to PostgreSQL");
  })
  .catch((err) => {
    console.error("PostgreSQL connection error:", err.message);
  });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
