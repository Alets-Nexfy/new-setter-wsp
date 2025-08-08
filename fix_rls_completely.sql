-- ============================================
-- FIX RLS POLICIES - COMPLETE SOLUTION
-- ============================================

-- 1. First, check current policies
SELECT tablename, policyname, permissive, cmd, qual
FROM pg_policies 
WHERE tablename IN ('messages', 'chats');

-- 2. Drop ALL existing policies to start fresh
DROP POLICY IF EXISTS "Enable read access for all users" ON messages;
DROP POLICY IF EXISTS "Enable insert for service role" ON messages;
DROP POLICY IF EXISTS "Enable update for service role" ON messages;
DROP POLICY IF EXISTS "Enable delete for service role" ON messages;
DROP POLICY IF EXISTS "Service role has full access to messages" ON messages;

DROP POLICY IF EXISTS "Enable read access for all users" ON chats;
DROP POLICY IF EXISTS "Enable insert for service role" ON chats;
DROP POLICY IF EXISTS "Enable update for service role" ON chats;
DROP POLICY IF EXISTS "Enable delete for service role" ON chats;
DROP POLICY IF EXISTS "Service role has full access to chats" ON chats;

-- 3. Create new PERMISSIVE policies that allow everything
-- FOR MESSAGES TABLE
CREATE POLICY "Allow all operations on messages" ON messages
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- FOR CHATS TABLE  
CREATE POLICY "Allow all operations on chats" ON chats
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- 4. Alternative: If the above doesn't work, create separate policies
/*
-- Messages policies
CREATE POLICY "Anyone can select messages" ON messages
    FOR SELECT USING (true);

CREATE POLICY "Anyone can insert messages" ON messages
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update messages" ON messages
    FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can delete messages" ON messages
    FOR DELETE USING (true);

-- Chats policies
CREATE POLICY "Anyone can select chats" ON chats
    FOR SELECT USING (true);

CREATE POLICY "Anyone can insert chats" ON chats
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update chats" ON chats
    FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can delete chats" ON chats
    FOR DELETE USING (true);
*/

-- 5. Make sure RLS is enabled
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;

-- 6. Grant permissions to all roles
GRANT ALL ON messages TO anon;
GRANT ALL ON messages TO authenticated;
GRANT ALL ON messages TO service_role;
GRANT ALL ON messages TO postgres;

GRANT ALL ON chats TO anon;
GRANT ALL ON chats TO authenticated;
GRANT ALL ON chats TO service_role;
GRANT ALL ON chats TO postgres;

-- 7. Verify the new policies
SELECT tablename, policyname, permissive, cmd, qual, with_check
FROM pg_policies 
WHERE tablename IN ('messages', 'chats')
ORDER BY tablename, policyname;

-- 8. Check which role your backend is using
SELECT current_user, current_role;