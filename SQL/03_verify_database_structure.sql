-- ============================================
-- VERIFICAR ESTRUCTURA DE BASE DE DATOS
-- Script para diagnóstico y verificación
-- ============================================

-- 1. Verificar si existe el usuario de prueba
SELECT 
    'Usuario de prueba existe:' as verificacion,
    COUNT(*) as cantidad
FROM users 
WHERE id = '0f1f5e62-3550-4d15-ae66-556786f08462';

-- 2. Verificar agentes del usuario de prueba
SELECT 
    'Agentes del usuario:' as verificacion,
    COUNT(*) as cantidad
FROM agents 
WHERE user_id = '0f1f5e62-3550-4d15-ae66-556786f08462';

-- 3. Ver estructura de la tabla agents
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'agents'
ORDER BY ordinal_position;

-- 4. Ver estructura de la tabla users
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name IN ('id', 'email', 'active_agent_id', 'created_at', 'updated_at')
ORDER BY ordinal_position;

-- 5. Verificar si existe tabla multi_agent_config
SELECT 
    'Tabla multi_agent_config existe:' as verificacion,
    EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_name = 'multi_agent_config'
    ) as existe;

-- 6. Ver todas las políticas RLS de la tabla agents
SELECT 
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'agents'
ORDER BY policyname;

-- 7. Ver constraints de foreign key en agents
SELECT 
    tc.constraint_name, 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
AND tc.table_name = 'agents';