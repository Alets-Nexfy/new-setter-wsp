-- ============================================
-- SUPABASE TABLES FOR WHATSAPP MESSAGE SYSTEM
-- ============================================

-- Drop existing tables if they exist (optional, be careful in production!)
-- DROP TABLE IF EXISTS messages CASCADE;
-- DROP TABLE IF EXISTS chats CASCADE;

-- ============================================
-- 1. MESSAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  body TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  is_from_me BOOLEAN DEFAULT FALSE,
  message_id TEXT,
  from_number TEXT,
  to_number TEXT,
  origin TEXT CHECK (origin IN ('contact', 'bot', 'human')),
  type TEXT DEFAULT 'text',
  has_media BOOLEAN DEFAULT FALSE,
  ack INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  is_auto_reply BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_chat ON messages(user_id, chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);

-- ============================================
-- 2. CHATS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY, -- Format: userId_chatId
  user_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  last_message_content TEXT,
  last_message_timestamp TIMESTAMPTZ,
  last_message_origin TEXT,
  last_contact_message_timestamp TIMESTAMPTZ,
  last_human_message_timestamp TIMESTAMPTZ,
  last_bot_message_timestamp TIMESTAMPTZ,
  last_activity_timestamp TIMESTAMPTZ,
  user_is_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, chat_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id);
CREATE INDEX IF NOT EXISTS idx_chats_chat_id ON chats(chat_id);
CREATE INDEX IF NOT EXISTS idx_chats_last_activity ON chats(last_activity_timestamp DESC);

-- ============================================
-- 3. TRIGGER FOR AUTO-UPDATE updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to messages table
CREATE TRIGGER update_messages_updated_at
  BEFORE UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to chats table
CREATE TRIGGER update_chats_updated_at
  BEFORE UPDATE ON chats
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 4. ROW LEVEL SECURITY (RLS) - Optional but recommended
-- ============================================
-- Enable RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;

-- Create policies (adjust according to your auth strategy)
-- Example: Users can only see their own messages
CREATE POLICY "Users can view own messages" ON messages
  FOR SELECT USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own messages" ON messages
  FOR INSERT WITH CHECK (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can update own messages" ON messages
  FOR UPDATE USING (auth.uid()::TEXT = user_id);

-- Example: Users can only see their own chats
CREATE POLICY "Users can view own chats" ON chats
  FOR SELECT USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own chats" ON chats
  FOR INSERT WITH CHECK (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can update own chats" ON chats
  FOR UPDATE USING (auth.uid()::TEXT = user_id);

-- ============================================
-- 5. GRANT PERMISSIONS (if using service role)
-- ============================================
-- If you're using service_role key, RLS is bypassed
-- But you can still grant explicit permissions
GRANT ALL ON messages TO authenticated;
GRANT ALL ON chats TO authenticated;
GRANT ALL ON messages TO service_role;
GRANT ALL ON chats TO service_role;

-- ============================================
-- 6. SAMPLE DATA (Optional - for testing)
-- ============================================
-- INSERT INTO chats (id, user_id, chat_id, last_message_content)
-- VALUES 
--   ('test_user_123456@c.us', 'test_user', '123456@c.us', 'Hello World');

-- INSERT INTO messages (id, user_id, chat_id, body, from_number, to_number, origin)
-- VALUES 
--   ('msg_test_1', 'test_user', '123456@c.us', 'Hello', '123456@c.us', 'me', 'contact');

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these to verify tables were created correctly:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'messages';
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'chats';