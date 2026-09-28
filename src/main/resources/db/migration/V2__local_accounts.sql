CREATE TABLE portal_users (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL,
    email_index VARCHAR(64) NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('CUSTOMER','OFFICER','ADMIN')),
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE TABLE portal_sessions (
    token_hash VARCHAR(64) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES portal_users(id),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX idx_sessions_expiry ON portal_sessions(expires_at);
CREATE INDEX idx_sessions_user ON portal_sessions(user_id);

