-- ================================
-- ROW LEVEL SECURITY CONFIGURATION
-- ================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE firebase_functions ENABLE ROW LEVEL SECURITY;

-- ================================
-- RLS POLICIES
-- ================================

-- Users: Users can only access their own data
CREATE POLICY "Users can view their own data" ON users FOR SELECT USING (auth.uid()::text = id::text);
CREATE POLICY "Users can update their own data" ON users FOR UPDATE USING (auth.uid()::text = id::text);

-- Sessions: Users can only access their own sessions
CREATE POLICY "Users can manage their own sessions" ON sessions FOR ALL USING (auth.uid()::text = user_id::text);

-- Chats: Users can only access their own chats
CREATE POLICY "Users can manage their own chats" ON chats FOR ALL USING (auth.uid()::text = user_id::text);

-- Messages: Users can only access their own messages
CREATE POLICY "Users can manage their own messages" ON messages FOR ALL USING (auth.uid()::text = user_id::text);

-- Agents: Users can only access their own agents
CREATE POLICY "Users can manage their own agents" ON agents FOR ALL USING (auth.uid()::text = user_id::text);

-- Agent Triggers: Through agent ownership
CREATE POLICY "Users can manage their own agent triggers" ON agent_triggers FOR ALL USING (
    auth.uid()::text IN (
        SELECT user_id::text FROM agents WHERE agents.id = agent_triggers.agent_id
    )
);

-- Kanban: Users can only access their own kanban items
CREATE POLICY "Users can manage their own kanban boards" ON kanban_boards FOR ALL USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can manage their own kanban columns" ON kanban_columns FOR ALL USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can manage their own kanban cards" ON kanban_cards FOR ALL USING (auth.uid()::text = user_id::text);

-- Notifications: Users can only access their own notifications
CREATE POLICY "Users can manage their own notifications" ON notifications FOR ALL USING (auth.uid()::text = user_id::text);

-- Automation: Users can only access their own automation
CREATE POLICY "Users can manage their own automation rules" ON automation_rules FOR ALL USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can manage their own action flows" ON action_flows FOR ALL USING (auth.uid()::text = user_id::text);

-- Firebase Functions: Users can only access their own functions
CREATE POLICY "Users can manage their own firebase functions" ON firebase_functions FOR ALL USING (auth.uid()::text = user_id::text);