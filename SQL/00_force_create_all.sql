-- ============================================
-- FORZAR CREACIÓN - MÉTODO NUCLEAR
-- Desactiva TODAS las restricciones temporalmente
-- ============================================

-- 1. Desactivar TODAS las restricciones temporalmente
BEGIN;

-- Desactivar RLS en ambas tablas
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE agents DISABLE ROW LEVEL SECURITY;

-- Desactivar temporalmente el foreign key constraint
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_user_id_fkey;

-- 2. Crear el usuario
INSERT INTO users (
    id,
    full_name,
    username,
    email,
    created_at,
    updated_at
) 
VALUES (
    '0f1f5e62-3550-4d15-ae66-556786f08462',
    'Test Multi Agent User',
    'testmultiagent',
    'test-multiagent@example.com',
    NOW(),
    NOW()
)
ON CONFLICT (id) DO UPDATE 
SET 
    full_name = EXCLUDED.full_name,
    username = EXCLUDED.username,
    updated_at = NOW();

-- 3. Crear los agentes
INSERT INTO agents (id, user_id, name, is_active, config, created_at, updated_at)
VALUES 
    (
        'a1111111-1111-1111-1111-111111111111',
        '0f1f5e62-3550-4d15-ae66-556786f08462',
        'Sales Agent',
        true,
        '{"name":"Sales Agent","description":"Maneja ventas","automation":{"agentNetwork":[],"triggers":[]}}',
        NOW(),
        NOW()
    ),
    (
        'a2222222-2222-2222-2222-222222222222',
        '0f1f5e62-3550-4d15-ae66-556786f08462',
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

-- 4. Asignar agente activo
UPDATE users
SET active_agent_id = 'a1111111-1111-1111-1111-111111111111'
WHERE id = '0f1f5e62-3550-4d15-ae66-556786f08462';

-- 5. Recrear el foreign key constraint
ALTER TABLE agents 
ADD CONSTRAINT agents_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES users(id) 
ON DELETE CASCADE;

-- 6. Reactivar RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- 7. Verificar todo
SELECT 'Usuario creado:' as info, id, email, active_agent_id
FROM users WHERE id = '0f1f5e62-3550-4d15-ae66-556786f08462';

SELECT 'Agentes creados:' as info, COUNT(*) as total
FROM agents WHERE user_id = '0f1f5e62-3550-4d15-ae66-556786f08462';

COMMIT;

-- 8. Si todo salió bien, el comando curl para probar es:
SELECT 'COMANDO CURL:' as titulo,
'curl -X POST "https://api.nexfy.io/api/multi-agent/tribe-ia-nexus_0f1f5e62-3550-4d15-ae66-556786f08462/config" -H "Content-Type: application/json" -d ''{"activeAgents":["a1111111-1111-1111-1111-111111111111","a2222222-2222-2222-2222-222222222222"],"defaultAgent":"a1111111-1111-1111-1111-111111111111","triggerConfig":{"initial":{},"switch":{},"fallback":[]}}''' as comando;