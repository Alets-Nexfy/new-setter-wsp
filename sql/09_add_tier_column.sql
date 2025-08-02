-- Add tier column to users table
-- All users will be enterprise_b2b tier by default

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS tier VARCHAR(50) NOT NULL DEFAULT 'enterprise_b2b' 
CHECK (tier IN ('standard', 'professional', 'enterprise', 'enterprise_b2b'));

-- Update existing users to have enterprise_b2b tier
UPDATE users SET tier = 'enterprise_b2b' WHERE tier IS NULL OR tier = '';

-- Add comment to column
COMMENT ON COLUMN users.tier IS 'User subscription tier - all users are enterprise_b2b by default';