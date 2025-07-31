-- ================================
-- VERIFICAR TODAS LAS TABLAS
-- ================================

-- Ver todas las tablas en el schema public
SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = tables.table_name AND table_schema = 'public') as column_count
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Ver columnas específicas de cada tabla principal
SELECT 'users' as table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users'
UNION ALL
SELECT 'sessions' as table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sessions'
UNION ALL
SELECT 'chats' as table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chats'
UNION ALL
SELECT 'messages' as table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'messages'
UNION ALL
SELECT 'agents' as table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agents'
ORDER BY table_name, column_name;