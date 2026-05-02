CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    bio TEXT,
    favorite_genre VARCHAR(50),
    avatar_url TEXT
);

CREATE TABLE reviews (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    tmdb_movie_id INTEGER NOT NULL,
    title VARCHAR(255),
    review_text TEXT NOT NULL,
    rating INTEGER NOT NULL,
    contains_spoilers BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT reviews_rating_check CHECK (rating >= 1 AND rating <= 10),
    CONSTRAINT reviews_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES users (id)
        ON DELETE CASCADE
);

CREATE INDEX idx_reviews_user_id
    ON reviews (user_id);

CREATE INDEX idx_reviews_tmdb_movie_id
    ON reviews (tmdb_movie_id);

CREATE TABLE review_comments (
    id SERIAL PRIMARY KEY,
    review_id INTEGER,
    user_id INTEGER,
    comment_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT review_comments_review_id_fkey FOREIGN KEY (review_id)
        REFERENCES reviews (id)
        ON DELETE CASCADE,

    CONSTRAINT review_comments_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES users (id)
        ON DELETE CASCADE
);

CREATE TABLE review_votes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    review_id INTEGER NOT NULL,
    vote_type VARCHAR(20) NOT NULL,

    CONSTRAINT review_votes_vote_type_check
        CHECK (vote_type IN ('helpful', 'not_helpful')),

    CONSTRAINT review_votes_review_id_fkey FOREIGN KEY (review_id)
        REFERENCES reviews (id)
        ON DELETE CASCADE,

    CONSTRAINT review_votes_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES users (id)
        ON DELETE CASCADE,

    CONSTRAINT review_votes_user_id_review_id_key
        UNIQUE (user_id, review_id)
);

CREATE INDEX idx_review_votes_review_id
    ON review_votes (review_id);


    
CREATE TABLE session (
    sid VARCHAR PRIMARY KEY,
    sess JSON NOT NULL,
    expire TIMESTAMP NOT NULL
);

CREATE INDEX IDX_session_expire
    ON session (expire);