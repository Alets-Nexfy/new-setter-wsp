-- ================================
-- CREAR SOLO LOS TRIGGERS QUE FALTAN
-- ================================

-- Primero verificar qué triggers ya existen
SELECT trigger_name, event_object_table 
FROM information_schema.triggers 
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- Crear triggers solo para tablas que no los tienen
DO $$
BEGIN
    -- Sessions trigger
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers 
                   WHERE trigger_name = 'update_sessions_updated_at') THEN
        CREATE TRIGGER update_sessions_updated_at 
        BEFORE UPDATE ON sessions 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    -- Chats trigger
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers 
                   WHERE trigger_name = 'update_chats_updated_at') THEN
        CREATE TRIGGER update_chats_updated_at 
        BEFORE UPDATE ON chats 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    -- Agents trigger
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers 
                   WHERE trigger_name = 'update_agents_updated_at') THEN
        CREATE TRIGGER update_agents_updated_at 
        BEFORE UPDATE ON agents 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    -- Kanban boards trigger
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers 
                   WHERE trigger_name = 'update_kanban_boards_updated_at') THEN
        CREATE TRIGGER update_kanban_boards_updated_at 
        BEFORE UPDATE ON kanban_boards 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    -- Kanban columns trigger
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers 
                   WHERE trigger_name = 'update_kanban_columns_updated_at') THEN
        CREATE TRIGGER update_kanban_columns_updated_at 
        BEFORE UPDATE ON kanban_columns 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    -- Kanban cards trigger
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers 
                   WHERE trigger_name = 'update_kanban_cards_updated_at') THEN
        CREATE TRIGGER update_kanban_cards_updated_at 
        BEFORE UPDATE ON kanban_cards 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    -- Automation rules trigger
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers 
                   WHERE trigger_name = 'update_automation_rules_updated_at') THEN
        CREATE TRIGGER update_automation_rules_updated_at 
        BEFORE UPDATE ON automation_rules 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    -- Action flows trigger
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers 
                   WHERE trigger_name = 'update_action_flows_updated_at') THEN
        CREATE TRIGGER update_action_flows_updated_at 
        BEFORE UPDATE ON action_flows 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    -- Firebase functions trigger
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers 
                   WHERE trigger_name = 'update_firebase_functions_updated_at') THEN
        CREATE TRIGGER update_firebase_functions_updated_at 
        BEFORE UPDATE ON firebase_functions 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;