-- ============================================
-- CREAR AGENTES DE PRUEBA PARA USUARIO EXISTENTE
-- Usuario ID: 0f1f5e62-3550-4d15-ae66-556786f08462
-- ============================================

-- 1. Verificar que el usuario existe
SELECT 
    'Usuario para pruebas:' as info,
    id, 
    email, 
    active_agent_id
FROM users 
WHERE id = '0f1f5e62-3550-4d15-ae66-556786f08462';

-- 2. Crear primer agente: Sales Agent
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

-- 3. Crear segundo agente: Support Agent
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

-- 4. Asignar el primer agente como activo al usuario
UPDATE users
SET 
    active_agent_id = 'a1111111-1111-1111-1111-111111111111',
    updated_at = NOW()
WHERE id = '0f1f5e62-3550-4d15-ae66-556786f08462';

-- 5. Verificar que los agentes se crearon correctamente
SELECT 
    'Agentes creados:' as info,
    id,
    name,
    is_active
FROM agents 
WHERE user_id = '0f1f5e62-3550-4d15-ae66-556786f08462';

-- 6. Verificar usuario actualizado
SELECT 
    'Usuario actualizado:' as info,
    id,
    email,
    active_agent_id
FROM users 
WHERE id = '0f1f5e62-3550-4d15-ae66-556786f08462';