-- ============================================
-- CONFIGURAR AGENTES PARA TU USUARIO
-- Usuario: b006bd62-4258-4cc6-bf94-78e4c92a8184
-- ============================================

-- 1. Verificar que tu usuario existe
SELECT 
    'Tu usuario:' as info,
    id,
    email,
    full_name,
    active_agent_id
FROM users 
WHERE id = 'b006bd62-4258-4cc6-bf94-78e4c92a8184';

-- 2. Ver si ya tienes agentes creados
SELECT 
    'Tus agentes existentes:' as info,
    id,
    name,
    is_active
FROM agents 
WHERE user_id = 'b006bd62-4258-4cc6-bf94-78e4c92a8184';

-- 3. Si no tienes agentes o quieres crear los de prueba, ejecuta esto:
BEGIN;

-- Desactivar RLS temporalmente
ALTER TABLE agents DISABLE ROW LEVEL SECURITY;

-- Crear/actualizar Sales Agent
INSERT INTO agents (id, user_id, name, is_active, config, created_at, updated_at)
VALUES (
    'a1111111-1111-1111-1111-111111111111',
    'b006bd62-4258-4cc6-bf94-78e4c92a8184',
    'Sales Agent',
    true,
    '{"name":"Sales Agent","description":"Maneja consultas de ventas y productos","personality":"Profesional y persuasivo","automation":{"agentNetwork":[],"triggers":[]}}',
    NOW(),
    NOW()
)
ON CONFLICT (id) DO UPDATE 
SET 
    user_id = 'b006bd62-4258-4cc6-bf94-78e4c92a8184',
    name = EXCLUDED.name,
    config = EXCLUDED.config,
    updated_at = NOW();

-- Crear/actualizar Support Agent
INSERT INTO agents (id, user_id, name, is_active, config, created_at, updated_at)
VALUES (
    'a2222222-2222-2222-2222-222222222222',
    'b006bd62-4258-4cc6-bf94-78e4c92a8184',
    'Support Agent',
    true,
    '{"name":"Support Agent","description":"Maneja soporte técnico y ayuda al cliente","personality":"Amable y paciente","automation":{"agentNetwork":[],"triggers":[]}}',
    NOW(),
    NOW()
)
ON CONFLICT (id) DO UPDATE 
SET 
    user_id = 'b006bd62-4258-4cc6-bf94-78e4c92a8184',
    name = EXCLUDED.name,
    config = EXCLUDED.config,
    updated_at = NOW();

-- Reactivar RLS
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- 4. Asignar el primer agente como activo
UPDATE users
SET 
    active_agent_id = 'a1111111-1111-1111-1111-111111111111',
    updated_at = NOW()
WHERE id = 'b006bd62-4258-4cc6-bf94-78e4c92a8184';

COMMIT;

-- 5. Verificar que todo funcionó
SELECT 
    'Usuario actualizado:' as info,
    id,
    email,
    active_agent_id
FROM users 
WHERE id = 'b006bd62-4258-4cc6-bf94-78e4c92a8184';

SELECT 
    'Agentes finales:' as info,
    id,
    name,
    is_active
FROM agents 
WHERE user_id = 'b006bd62-4258-4cc6-bf94-78e4c92a8184';

-- 6. COMANDOS CURL PARA PROBAR CON TU USUARIO:

-- Comando básico:
SELECT 'COMANDO CURL BÁSICO:' as titulo;
SELECT 'curl -X POST "https://api.nexfy.io/api/multi-agent/tribe-ia-nexus_b006bd62-4258-4cc6-bf94-78e4c92a8184/config" -H "Content-Type: application/json" -d ''{"activeAgents":["a1111111-1111-1111-1111-111111111111","a2222222-2222-2222-2222-222222222222"],"defaultAgent":"a1111111-1111-1111-1111-111111111111","triggerConfig":{"initial":{},"switch":{},"fallback":[]}}''' as comando;

-- Comando con triggers configurados:
SELECT 'COMANDO CURL CON TRIGGERS:' as titulo;
SELECT 'curl -X POST "https://api.nexfy.io/api/multi-agent/tribe-ia-nexus_b006bd62-4258-4cc6-bf94-78e4c92a8184/config" -H "Content-Type: application/json" -d ''{"activeAgents":["a1111111-1111-1111-1111-111111111111","a2222222-2222-2222-2222-222222222222"],"defaultAgent":"a1111111-1111-1111-1111-111111111111","triggerConfig":{"initial":{"keywords":["venta","comprar","precio"],"agentId":"a1111111-1111-1111-1111-111111111111"},"switch":{"fromAgent":"a1111111-1111-1111-1111-111111111111","toAgent":"a2222222-2222-2222-2222-222222222222","keywords":["ayuda","soporte","problema"]},"fallback":["a1111111-1111-1111-1111-111111111111"]}}''' as comando;