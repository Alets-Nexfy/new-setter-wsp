-- ============================================
-- MIGRATION SCRIPT - Add missing columns to existing tables
-- ============================================

-- First, let's check what columns exist in the tables
-- Run this query first to see current structure:
/*
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('messages', 'chats')
ORDER BY table_name, ordinal_position;
*/

-- ============================================
-- ADD MISSING COLUMNS TO CHATS TABLE
-- ============================================

-- Add missing columns to chats table if they don't exist
DO $$ 
BEGIN
  -- Add last_activity_timestamp if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'chats' AND column_name = 'last_activity_timestamp') THEN
    ALTER TABLE chats ADD COLUMN last_activity_timestamp TIMESTAMPTZ;
  END IF;

  -- Add last_contact_message_timestamp if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'chats' AND column_name = 'last_contact_message_timestamp') THEN
    ALTER TABLE chats ADD COLUMN last_contact_message_timestamp TIMESTAMPTZ;
  END IF;

  -- Add last_human_message_timestamp if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'chats' AND column_name = 'last_human_message_timestamp') THEN
    ALTER TABLE chats ADD COLUMN last_human_message_timestamp TIMESTAMPTZ;
  END IF;

  -- Add last_bot_message_timestamp if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'chats' AND column_name = 'last_bot_message_timestamp') THEN
    ALTER TABLE chats ADD COLUMN last_bot_message_timestamp TIMESTAMPTZ;
  END IF;

  -- Add last_message_origin if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'chats' AND column_name = 'last_message_origin') THEN
    ALTER TABLE chats ADD COLUMN last_message_origin TEXT;
  END IF;

  -- Add last_message_content if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'chats' AND column_name = 'last_message_content') THEN
    ALTER TABLE chats ADD COLUMN last_message_content TEXT;
  END IF;

  -- Add last_message_timestamp if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'chats' AND column_name = 'last_message_timestamp') THEN
    ALTER TABLE chats ADD COLUMN last_message_timestamp TIMESTAMPTZ;
  END IF;

  -- Add user_is_active if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'chats' AND column_name = 'user_is_active') THEN
    ALTER TABLE chats ADD COLUMN user_is_active BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- ============================================
-- ADD MISSING COLUMNS TO MESSAGES TABLE
-- ============================================

DO $$ 
BEGIN
  -- Add ack if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'messages' AND column_name = 'ack') THEN
    ALTER TABLE messages ADD COLUMN ack INTEGER DEFAULT 0;
  END IF;

  -- Add is_from_me if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'messages' AND column_name = 'is_from_me') THEN
    ALTER TABLE messages ADD COLUMN is_from_me BOOLEAN DEFAULT FALSE;
  END IF;

  -- Add message_id if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'messages' AND column_name = 'message_id') THEN
    ALTER TABLE messages ADD COLUMN message_id TEXT;
  END IF;

  -- Add from_number if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'messages' AND column_name = 'from_number') THEN
    ALTER TABLE messages ADD COLUMN from_number TEXT;
  END IF;

  -- Add to_number if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'messages' AND column_name = 'to_number') THEN
    ALTER TABLE messages ADD COLUMN to_number TEXT;
  END IF;

  -- Add origin if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'messages' AND column_name = 'origin') THEN
    ALTER TABLE messages ADD COLUMN origin TEXT;
  END IF;

  -- Add type if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'messages' AND column_name = 'type') THEN
    ALTER TABLE messages ADD COLUMN type TEXT DEFAULT 'text';
  END IF;

  -- Add has_media if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'messages' AND column_name = 'has_media') THEN
    ALTER TABLE messages ADD COLUMN has_media BOOLEAN DEFAULT FALSE;
  END IF;

  -- Add status if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'messages' AND column_name = 'status') THEN
    ALTER TABLE messages ADD COLUMN status TEXT DEFAULT 'pending';
  END IF;

  -- Add is_auto_reply if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'messages' AND column_name = 'is_auto_reply') THEN
    ALTER TABLE messages ADD COLUMN is_auto_reply BOOLEAN DEFAULT FALSE;
  END IF;

  -- Add timestamp if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'messages' AND column_name = 'timestamp') THEN
    ALTER TABLE messages ADD COLUMN timestamp TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- ============================================
-- VERIFY CHANGES
-- ============================================
-- After running this migration, verify the columns were added:
SELECT 
  table_name,
  column_name, 
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name IN ('messages', 'chats')
ORDER BY table_name, ordinal_position;