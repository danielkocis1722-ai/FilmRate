exports.requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect("/login?redirect=" + req.originalUrl);
  }
  next();
};
