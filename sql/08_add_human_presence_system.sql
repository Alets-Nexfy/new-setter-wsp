-- ================================
-- SISTEMA DE DETECCIÓN DE PRESENCIA HUMANA
-- ================================

-- Agregar columnas para detección de presencia a la tabla chats
ALTER TABLE chats ADD COLUMN IF NOT EXISTS last_human_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE chats ADD COLUMN IF NOT EXISTS human_present BOOLEAN DEFAULT FALSE;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS auto_agent_paused BOOLEAN DEFAULT FALSE;

-- Agregar columnas para detección de presencia a la tabla users
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_human_interaction TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_human_present BOOLEAN DEFAULT FALSE;

-- Crear tabla para registrar actividad humana detallada
CREATE TABLE IF NOT EXISTS human_activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL CHECK (activity_type IN ('message_sent', 'message_read', 'typing', 'online', 'offline')),
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('whatsapp', 'instagram'))
);

-- Crear índices para optimizar consultas de presencia
CREATE INDEX IF NOT EXISTS idx_chats_last_human_activity ON chats(last_human_activity DESC);
CREATE INDEX IF NOT EXISTS idx_chats_human_present ON chats(human_present, last_human_activity);
CREATE INDEX IF NOT EXISTS idx_users_last_human_interaction ON users(last_human_interaction DESC);
CREATE INDEX IF NOT EXISTS idx_human_activity_log_user_time ON human_activity_log(user_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_human_activity_log_chat_time ON human_activity_log(chat_id, detected_at DESC);

-- Crear función para actualizar presencia humana
CREATE OR REPLACE FUNCTION update_human_presence()
RETURNS TRIGGER AS $$
BEGIN
    -- Si es un mensaje del humano (no del bot)
    IF NEW.from_contact != 'bot' AND NEW.from_contact != 'agent' THEN
        -- Actualizar última actividad humana en el chat
        UPDATE chats 
        SET 
            last_human_activity = NOW(),
            human_present = TRUE,
            auto_agent_paused = TRUE
        WHERE id = NEW.chat_id;
        
        -- Actualizar última interacción humana del usuario
        UPDATE users 
        SET 
            last_human_interaction = NOW(),
            is_human_present = TRUE
        WHERE id = NEW.user_id;
        
        -- Registrar actividad en el log
        INSERT INTO human_activity_log (user_id, chat_id, activity_type, platform, metadata)
        VALUES (
            NEW.user_id, 
            NEW.chat_id, 
            'message_sent', 
            NEW.platform,
            jsonb_build_object(
                'message_type', NEW.message_type,
                'content_length', LENGTH(NEW.content)
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger para detectar actividad humana en mensajes
DROP TRIGGER IF EXISTS trigger_detect_human_activity ON messages;
CREATE TRIGGER trigger_detect_human_activity
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_human_presence();

-- Función para verificar si el humano está presente (últimos 10 minutos)
CREATE OR REPLACE FUNCTION is_human_present_in_chat(chat_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    last_activity TIMESTAMP WITH TIME ZONE;
    minutes_threshold INTEGER := 10;
BEGIN
    SELECT last_human_activity INTO last_activity
    FROM chats 
    WHERE id = chat_uuid;
    
    IF last_activity IS NULL THEN
        RETURN FALSE;
    END IF;
    
    RETURN (NOW() - last_activity) <= INTERVAL '10 minutes';
END;
$$ LANGUAGE plpgsql;

-- Función para verificar presencia humana global del usuario
CREATE OR REPLACE FUNCTION is_user_human_present(user_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    last_interaction TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT last_human_interaction INTO last_interaction
    FROM users 
    WHERE id = user_uuid;
    
    IF last_interaction IS NULL THEN
        RETURN FALSE;
    END IF;
    
    RETURN (NOW() - last_interaction) <= INTERVAL '10 minutes';
END;
$$ LANGUAGE plpgsql;

-- Función para limpiar estados de presencia expirados
CREATE OR REPLACE FUNCTION cleanup_expired_presence()
RETURNS VOID AS $$
BEGIN
    -- Actualizar chats donde la presencia humana ha expirado
    UPDATE chats 
    SET 
        human_present = FALSE,
        auto_agent_paused = FALSE
    WHERE 
        human_present = TRUE 
        AND (NOW() - last_human_activity) > INTERVAL '10 minutes';
    
    -- Actualizar usuarios donde la presencia humana ha expirado
    UPDATE users 
    SET is_human_present = FALSE
    WHERE 
        is_human_present = TRUE 
        AND (NOW() - last_human_interaction) > INTERVAL '10 minutes';
        
    -- Log de limpieza
    INSERT INTO human_activity_log (user_id, activity_type, platform, metadata)
    SELECT 
        id,
        'cleanup_expired',
        'whatsapp',
        jsonb_build_object('cleaned_at', NOW())
    FROM users 
    WHERE 
        is_human_present = FALSE 
        AND (NOW() - last_human_interaction) > INTERVAL '10 minutes'
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Función para obtener estadísticas de presencia
CREATE OR REPLACE FUNCTION get_presence_stats(user_uuid UUID)
RETURNS TABLE(
    chat_id UUID,
    contact_name VARCHAR,
    human_present BOOLEAN,
    last_activity TIMESTAMP WITH TIME ZONE,
    minutes_since_activity INTEGER,
    agent_should_respond BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.contact_name,
        c.human_present,
        c.last_human_activity,
        EXTRACT(EPOCH FROM (NOW() - c.last_human_activity))::INTEGER / 60 as minutes_since,
        CASE 
            WHEN c.human_present = FALSE OR (NOW() - c.last_human_activity) > INTERVAL '10 minutes' 
            THEN TRUE 
            ELSE FALSE 
        END as should_respond
    FROM chats c
    WHERE c.user_id = user_uuid
    AND c.is_active = TRUE
    ORDER BY c.last_message_time DESC;
END;
$$ LANGUAGE plpgsql;

-- Verificar que todo se creó correctamente
SELECT 
    'Tables' as type,
    table_name as name,
    'created' as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('human_activity_log')

UNION ALL

SELECT 
    'Functions' as type,
    routine_name as name,
    'created' as status
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('update_human_presence', 'is_human_present_in_chat', 'is_user_human_present', 'cleanup_expired_presence', 'get_presence_stats')

UNION ALL

SELECT 
    'Triggers' as type,
    trigger_name as name,
    'created' as status
FROM information_schema.triggers 
WHERE trigger_schema = 'public' 
AND trigger_name = 'trigger_detect_human_activity'

ORDER BY type, name;