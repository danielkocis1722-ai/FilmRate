CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE reviews (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_movie_id INTEGER NOT NULL,
  title VARCHAR(255),
  review_text TEXT NOT NULL,
  rating NUMERIC(2,1) NOT NULL CHECK (rating >= 1 AND rating <= 10),
  contains_spoilers BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE review_votes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  vote_type VARCHAR(20) NOT NULL CHECK (vote_type IN ('helpful', 'not_helpful')),
  UNIQUE(user_id, review_id)
);

CREATE INDEX idx_reviews_user_id ON reviews(user_id);
CREATE INDEX idx_reviews_tmdb_movie_id ON reviews(tmdb_movie_id);
CREATE INDEX idx_review_votes_review_id ON review_votes(review_id);