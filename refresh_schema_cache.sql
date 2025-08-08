-- ============================================
-- REFRESH SUPABASE SCHEMA CACHE
-- ============================================

-- Method 1: Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- Method 2: Use pg_notify function
SELECT pg_notify('pgrst', 'reload schema');

-- Method 3: Force cache refresh by altering a table comment
COMMENT ON TABLE messages IS 'Messages table - updated at ' || now();
COMMENT ON TABLE chats IS 'Chats table - updated at ' || now();

-- Verify columns exist
SELECT 
    table_name,
    column_name, 
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name IN ('messages', 'chats')
AND column_name IN ('extension', 'topic', 'platform', 'content', 'from_contact', 'to_contact')
ORDER BY table_name, column_name;