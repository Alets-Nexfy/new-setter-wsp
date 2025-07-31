-- ================================
-- FIX MISSING COLUMNS
-- ================================

-- Check current columns in users table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
ORDER BY ordinal_position;

-- Add missing columns if they don't exist
DO $$
BEGIN
    -- Add last_activity column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'last_activity') THEN
        ALTER TABLE users ADD COLUMN last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;

    -- Add b2b_info column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'b2b_info') THEN
        ALTER TABLE users ADD COLUMN b2b_info JSONB DEFAULT NULL;
    END IF;
END $$;

-- Verify columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
ORDER BY ordinal_position;