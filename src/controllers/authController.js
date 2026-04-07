const bcrypt = require("bcrypt");
const pool = require("../config/db");

exports.getRegisterPage = (req, res) => {
  res.render("register");
};

exports.postRegister = async (req, res) => {
  const { username, email, password, confirmPassword, terms } = req.body;

  if (!username || !email || !password || !confirmPassword) {
    return res.status(400).send("Vyplň všetky polia.");
  }

  if (password !== confirmPassword) {
    return res.status(400).send("Heslá sa nezhodujú.");
  }

  if (!terms) {
    return res.status(400).send("Musíš súhlasiť s podmienkami.");
  }

  try {
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE username = $1 OR email = $2",
      [username, email],
    );

    if (existingUser.rows.length > 0) {
      return res
        .status(400)
        .send("Používateľské meno alebo e-mail už existuje.");
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, username, email, role`,
      [username, email, passwordHash],
    );

    req.session.user = result.rows[0];

    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).send("Chyba pri ukladaní session.");
      }

      res.redirect(req.query.redirect || "/");
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).send("Chyba pri registrácii.");
  }
};

exports.getLoginPage = (req, res) => {
  res.render("login");
};

exports.postLogin = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).send("Vyplň prihlasovacie údaje.");
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [
      username,
    ]);

    if (result.rows.length === 0) {
      return res.status(400).send("Nesprávne prihlasovacie údaje.");
    }

    const user = result.rows[0];

    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(400).send("Nesprávne prihlasovacie údaje.");
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    };

    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).send("Chyba pri ukladaní session.");
      }

      res.redirect(req.query.redirect || "/");
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).send("Chyba pri prihlasovaní.");
  }
};

exports.logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
      return res.status(500).send("Nepodarilo sa odhlásiť.");
    }

    res.clearCookie("connect.sid");
    res.redirect("/");
  });
};
