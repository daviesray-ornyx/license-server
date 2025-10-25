-- Migration: Analytics Users Authentication
-- Created: 2025-10-25
-- Description: Add user authentication for analytics dashboard access

-- Table: analytics_users
-- Stores email/password for users who can access analytics
CREATE TABLE IF NOT EXISTS analytics_users (
    id SERIAL PRIMARY KEY,
    license_key VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    
    -- Ensure unique email per license
    CONSTRAINT unique_license_email UNIQUE(license_key, email)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_analytics_users_license ON analytics_users(license_key);
CREATE INDEX IF NOT EXISTS idx_analytics_users_email ON analytics_users(email);
CREATE INDEX IF NOT EXISTS idx_analytics_users_active ON analytics_users(is_active);

-- Table: analytics_sessions
-- Track authentication sessions with 30-day validity
CREATE TABLE IF NOT EXISTS analytics_sessions (
    id SERIAL PRIMARY KEY,
    license_key VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    session_token VARCHAR(500) NOT NULL UNIQUE,
    device_id VARCHAR(255),
    validated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    is_valid BOOLEAN DEFAULT true,
    
    CONSTRAINT fk_session_user FOREIGN KEY (license_key, email) 
        REFERENCES analytics_users(license_key, email) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_token ON analytics_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_license ON analytics_sessions(license_key);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_expires ON analytics_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_valid ON analytics_sessions(is_valid);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_analytics_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating updated_at
CREATE TRIGGER trigger_analytics_users_updated_at
    BEFORE UPDATE ON analytics_users
    FOR EACH ROW
    EXECUTE FUNCTION update_analytics_users_updated_at();

-- Clean up expired sessions (can be run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    UPDATE analytics_sessions
    SET is_valid = false
    WHERE expires_at < CURRENT_TIMESTAMP AND is_valid = true;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE analytics_users IS 'Users authorized to access analytics dashboard for each license';
COMMENT ON TABLE analytics_sessions IS 'Active authentication sessions with 30-day validity period';
COMMENT ON COLUMN analytics_users.password_hash IS 'bcrypt hashed password - NEVER store plain text';
COMMENT ON COLUMN analytics_sessions.session_token IS 'JWT token for session validation';
COMMENT ON COLUMN analytics_sessions.expires_at IS '30 days from validated_at - auto-calculated';

