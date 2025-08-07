-- ============================================
-- DEBUG: DIAGNÓSTICO DE PROBLEMA FOREIGN KEY
-- Ejecutar este script para entender el problema
-- ============================================

-- 1. Ver si el usuario existe EN REALIDAD (sin RLS)
SET SESSION AUTHORIZATION postgres;
SELECT 
    'Usuario existe (como postgres):' as verificacion,
    id,
    email
FROM users 
WHERE id = '0f1f5e62-3550-4d15-ae66-556786f08462';
RESET SESSION AUTHORIZATION;

-- 2. Verificar el tipo de las columnas
SELECT 
    'Tipo de columna users.id:' as descripcion,
    column_name,
    data_type,
    character_maximum_length
FROM information_schema.columns
WHERE table_name = 'users' 
AND column_name = 'id';

SELECT 
    'Tipo de columna agents.user_id:' as descripcion,
    column_name,
    data_type,
    character_maximum_length
FROM information_schema.columns
WHERE table_name = 'agents' 
AND column_name = 'user_id';

-- 3. Ver el constraint exacto
SELECT 
    conname AS constraint_name,
    conrelid::regclass AS table_name,
    a.attname AS column_name,
    confrelid::regclass AS foreign_table_name,
    af.attname AS foreign_column_name
FROM pg_constraint c
JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
JOIN pg_attribute af ON af.attnum = ANY(c.confkey) AND af.attrelid = c.confrelid
WHERE c.contype = 'f'
AND c.conrelid = 'agents'::regclass;

-- 4. Intentar crear el usuario sin RLS
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

INSERT INTO users (
    id,
    email,
    created_at,
    updated_at
) 
VALUES (
    '0f1f5e62-3550-4d15-ae66-556786f08462',
    'test-multiagent@example.com',
    NOW(),
    NOW()
)
ON CONFLICT (id) DO UPDATE 
SET updated_at = NOW();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 5. Verificar que ahora existe
SELECT 
    'Usuario después de crear sin RLS:' as estado,
    id,
    email
FROM users 
WHERE id = '0f1f5e62-3550-4d15-ae66-556786f08462';