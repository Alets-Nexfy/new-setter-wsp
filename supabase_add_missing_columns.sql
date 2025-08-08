-- ============================================
-- ADD ONLY THE MISSING COLUMNS
-- ============================================

-- Add last_activity_timestamp to chats table (missing)
ALTER TABLE chats 
ADD COLUMN IF NOT EXISTS last_activity_timestamp TIMESTAMP WITH TIME ZONE;

-- Add last_contact_message_timestamp to chats table (missing)
ALTER TABLE chats 
ADD COLUMN IF NOT EXISTS last_contact_message_timestamp TIMESTAMP WITH TIME ZONE;

-- Verify the columns were added:
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'chats' 
AND column_name IN ('last_activity_timestamp', 'last_contact_message_timestamp')
ORDER BY column_name;