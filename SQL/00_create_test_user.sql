-- ============================================
-- CREAR USUARIO DE PRUEBA
-- Este script DEBE ejecutarse ANTES que los demás
-- ============================================

-- 1. Verificar si el usuario ya existe
SELECT 
    'Verificando usuario:' as accion,
    COUNT(*) as existe
FROM users 
WHERE id = '0f1f5e62-3550-4d15-ae66-556786f08462';

-- 2. Si no existe, crearlo (si el COUNT anterior es 0, ejecuta esto)
INSERT INTO users (
    id,
    email,
    full_name,
    username,
    created_at,
    updated_at
) 
SELECT 
    '0f1f5e62-3550-4d15-ae66-556786f08462',
    'test-multiagent@example.com',
    'Test Multi Agent User',
    'testmultiagent',
    NOW(),
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE id = '0f1f5e62-3550-4d15-ae66-556786f08462'
);

-- 3. Verificar que el usuario fue creado
SELECT 
    'Usuario creado/existente:' as resultado,
    id,
    email,
    full_name,
    username,
    active_agent_id
FROM users 
WHERE id = '0f1f5e62-3550-4d15-ae66-556786f08462';

-- 4. Si el insert falla por columnas faltantes, usa este comando alternativo:
-- NOTA: Solo ejecutar si el comando anterior da error por columnas requeridas
/*
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
ON CONFLICT (id) DO NOTHING;
*/