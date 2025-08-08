-- ============================================
-- FORCE SCHEMA RELOAD - AGGRESSIVE METHOD
-- ============================================

-- 1. Send multiple reload notifications
NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');
SELECT pg_notify('pgrst', 'reload config');

-- 2. Force cache invalidation by modifying table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS _temp_reload BOOLEAN DEFAULT FALSE;
ALTER TABLE messages DROP COLUMN IF EXISTS _temp_reload;

-- 3. Alternative: Restart all connections (BE CAREFUL!)
-- This will disconnect all clients temporarily
-- SELECT pg_terminate_backend(pid) 
-- FROM pg_stat_activity 
-- WHERE datname = current_database() 
-- AND pid <> pg_backend_pid()
-- AND application_name LIKE '%postgrest%';

-- 4. Check if PostgREST is running and its settings
SELECT application_name, state, query_start, state_change
FROM pg_stat_activity
WHERE application_name LIKE '%postgrest%' OR application_name LIKE '%pgrst%'
ORDER BY query_start DESC
LIMIT 5;

-- 5. Verify the columns exist (they do, but PostgREST doesn't see them)
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'messages'
AND column_name IN ('topic', 'extension', 'content', 'platform')
ORDER BY ordinal_position;