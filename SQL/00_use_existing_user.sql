-- ============================================
-- USAR UN USUARIO EXISTENTE
-- En lugar de crear uno nuevo, usamos uno que ya exista
-- ============================================

-- 1. Buscar CUALQUIER usuario que exista en la base de datos
SELECT 
    'Usuarios existentes (primeros 5):' as info,
    id,
    email,
    full_name,
    active_agent_id
FROM users
LIMIT 5;

-- 2. Tomar el PRIMER usuario que exista y usarlo
-- IMPORTANTE: Copia el ID del primer usuario del query anterior
-- y reemplaza 'USUARIO_ID_AQUI' en los siguientes comandos

-- 3. Después de identificar un usuario existente, ejecuta esto:
-- (Reemplaza USUARIO_ID_AQUI con el ID real del usuario)

/*
-- Desactivar RLS temporalmente
ALTER TABLE agents DISABLE ROW LEVEL SECURITY;

-- Crear agentes para el usuario existente
INSERT INTO agents (id, user_id, name, is_active, config, created_at, updated_at)
VALUES (
    'a1111111-1111-1111-1111-111111111111',
    'USUARIO_ID_AQUI',  -- <-- REEMPLAZAR CON ID REAL
    'Sales Agent',
    true,
    '{"name":"Sales Agent","description":"Maneja ventas","automation":{"agentNetwork":[],"triggers":[]}}',
    NOW(),
    NOW()
)
ON CONFLICT (id) DO UPDATE 
SET 
    name = EXCLUDED.name,
    config = EXCLUDED.config,
    updated_at = NOW();

INSERT INTO agents (id, user_id, name, is_active, config, created_at, updated_at)
VALUES (
    'a2222222-2222-2222-2222-222222222222',
    'USUARIO_ID_AQUI',  -- <-- REEMPLAZAR CON ID REAL
    'Support Agent',
    true,
    '{"name":"Support Agent","description":"Maneja soporte","automation":{"agentNetwork":[],"triggers":[]}}',
    NOW(),
    NOW()
)
ON CONFLICT (id) DO UPDATE 
SET 
    name = EXCLUDED.name,
    config = EXCLUDED.config,
    updated_at = NOW();

-- Reactivar RLS
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- Asignar agente activo
UPDATE users
SET active_agent_id = 'a1111111-1111-1111-1111-111111111111'
WHERE id = 'USUARIO_ID_AQUI';  -- <-- REEMPLAZAR CON ID REAL

-- Verificar
SELECT 'Agentes creados para usuario:' as info, COUNT(*) as total
FROM agents 
WHERE user_id = 'USUARIO_ID_AQUI';  -- <-- REEMPLAZAR CON ID REAL
*/