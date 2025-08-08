-- ============================================
-- FIX SUPABASE CACHE AND RLS ISSUES
-- ============================================

-- 1. Refresh Supabase schema cache
-- This forces Supabase to reload the table structure
NOTIFY pgrst, 'reload schema';

-- 2. Temporarily disable RLS for testing (BE CAREFUL IN PRODUCTION!)
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE chats DISABLE ROW LEVEL SECURITY;

-- OR if you want to keep RLS but fix the policies:
-- First, drop existing policies
DROP POLICY IF EXISTS "Users can view own messages" ON messages;
DROP POLICY IF EXISTS "Users can insert own messages" ON messages;
DROP POLICY IF EXISTS "Users can update own messages" ON messages;
DROP POLICY IF EXISTS "Users can view own chats" ON chats;
DROP POLICY IF EXISTS "Users can insert own chats" ON chats;
DROP POLICY IF EXISTS "Users can update own chats" ON chats;

-- Create more permissive policies for service role
-- These allow the service role (your backend) to do everything
CREATE POLICY "Service role has full access to messages" ON messages
  FOR ALL USING (true);

CREATE POLICY "Service role has full access to chats" ON chats
  FOR ALL USING (true);

-- Re-enable RLS with new policies
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;

-- 3. Grant all permissions to service role
GRANT ALL ON messages TO service_role;
GRANT ALL ON chats TO service_role;
GRANT ALL ON messages TO anon;
GRANT ALL ON chats TO anon;

-- 4. Verify the extension column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'messages' 
AND column_name = 'extension';

-- 5. If extension column doesn't exist, add it
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS extension TEXT DEFAULT 'whatsapp';

-- 6. Refresh the PostgREST schema cache again
SELECT pg_notify('pgrst', 'reload schema');