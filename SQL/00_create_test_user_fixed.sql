-- ============================================
-- CREAR USUARIO DE PRUEBA - VERSION CORREGIDA
-- Con todos los campos requeridos
-- ============================================

-- 1. Desactivar RLS temporalmente para poder crear el usuario
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- 2. Crear el usuario con TODOS los campos requeridos
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
    email = EXCLUDED.email,
    updated_at = NOW();

-- 3. Reactivar RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 4. Verificar que el usuario fue creado correctamente
SELECT 
    'Usuario creado exitosamente:' as estado,
    id,
    full_name,
    username,
    email,
    active_agent_id
FROM users 
WHERE id = '0f1f5e62-3550-4d15-ae66-556786f08462';

-- 5. Ahora crear los agentes (con RLS desactivado temporalmente)
ALTER TABLE agents DISABLE ROW LEVEL SECURITY;

-- Crear Sales Agent
INSERT INTO agents (id, user_id, name, is_active, config, created_at, updated_at)
VALUES (
    'a1111111-1111-1111-1111-111111111111',
    '0f1f5e62-3550-4d15-ae66-556786f08462',
    'Sales Agent',
    true,
    '{"name":"Sales Agent","description":"Maneja consultas de ventas y productos","personality":"Profesional y persuasivo","automation":{"agentNetwork":[],"triggers":[]}}',
    NOW(),
    NOW()
)
ON CONFLICT (id) DO UPDATE 
SET 
    name = EXCLUDED.name,
    config = EXCLUDED.config,
    updated_at = NOW();

-- Crear Support Agent
INSERT INTO agents (id, user_id, name, is_active, config, created_at, updated_at)
VALUES (
    'a2222222-2222-2222-2222-222222222222',
    '0f1f5e62-3550-4d15-ae66-556786f08462',
    'Support Agent',
    true,
    '{"name":"Support Agent","description":"Maneja soporte técnico y ayuda al cliente","personality":"Amable y paciente","automation":{"agentNetwork":[],"triggers":[]}}',
    NOW(),
    NOW()
)
ON CONFLICT (id) DO UPDATE 
SET 
    name = EXCLUDED.name,
    config = EXCLUDED.config,
    updated_at = NOW();

-- 6. Reactivar RLS para agents
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- 7. Asignar el primer agente como activo al usuario
UPDATE users
SET 
    active_agent_id = 'a1111111-1111-1111-1111-111111111111',
    updated_at = NOW()
WHERE id = '0f1f5e62-3550-4d15-ae66-556786f08462';

-- 8. Verificación final
SELECT 
    'RESUMEN FINAL:' as titulo,
    '----------------' as separador;

SELECT 
    'Usuario:' as tipo,
    id,
    full_name,
    email,
    active_agent_id
FROM users 
WHERE id = '0f1f5e62-3550-4d15-ae66-556786f08462';

SELECT 
    'Agentes:' as tipo,
    id,
    name,
    is_active
FROM agents 
WHERE user_id = '0f1f5e62-3550-4d15-ae66-556786f08462';

-- 9. Comando curl para probar
SELECT 
    'Ejecuta este comando curl para probar:' as instruccion,
    'curl -X POST "https://api.nexfy.io/api/multi-agent/tribe-ia-nexus_0f1f5e62-3550-4d15-ae66-556786f08462/config" -H "Content-Type: application/json" -d ''{"activeAgents":["a1111111-1111-1111-1111-111111111111","a2222222-2222-2222-2222-222222222222"],"defaultAgent":"a1111111-1111-1111-1111-111111111111","triggerConfig":{"initial":{},"switch":{},"fallback":[]}}''' as comando;