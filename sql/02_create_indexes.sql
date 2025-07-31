-- ================================
-- PERFORMANCE INDEXES
-- ================================

-- Users indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_tier_status ON users(tier, status);
CREATE INDEX idx_users_last_activity ON users(last_activity DESC);

-- Sessions indexes (CRÍTICOS)
CREATE INDEX idx_sessions_user_platform_status ON sessions(user_id, platform, status);
CREATE INDEX idx_sessions_platform_last_activity ON sessions(platform, last_activity);
CREATE INDEX idx_sessions_user_status ON sessions(user_id, status);

-- Messages indexes (MUY CRÍTICOS para performance)
CREATE INDEX idx_messages_session_timestamp ON messages(session_id, timestamp DESC);
CREATE INDEX idx_messages_user_platform_timestamp ON messages(user_id, platform, timestamp DESC);
CREATE INDEX idx_messages_chat_timestamp ON messages(chat_id, timestamp DESC);
CREATE INDEX idx_messages_type_status ON messages(message_type, status);
CREATE INDEX idx_messages_timestamp ON messages(timestamp DESC);

-- Chats indexes
CREATE INDEX idx_chats_user_active_last_message ON chats(user_id, is_active, last_message_time DESC);
CREATE INDEX idx_chats_platform_archived ON chats(platform, is_archived);
CREATE INDEX idx_chats_contact_user ON chats(contact_id, user_id);
CREATE INDEX idx_chats_assigned_agent ON chats(assigned_agent) WHERE assigned_agent IS NOT NULL;

-- Agents indexes
CREATE INDEX idx_agents_user_active ON agents(user_id, is_active);
CREATE INDEX idx_agents_user_default ON agents(user_id, is_default);
CREATE INDEX idx_agents_type ON agents(agent_type);

-- Kanban indexes
CREATE INDEX idx_kanban_cards_board_column_position ON kanban_cards(board_id, column_id, position);
CREATE INDEX idx_kanban_cards_user_board ON kanban_cards(user_id, board_id);
CREATE INDEX idx_kanban_columns_board_position ON kanban_columns(board_id, position);

-- Notifications indexes
CREATE INDEX idx_notifications_user_read_created ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_expires_at ON notifications(expires_at) WHERE expires_at IS NOT NULL;

-- Full-text search indexes
CREATE INDEX idx_messages_content_fts ON messages USING gin(to_tsvector('english', content));
CREATE INDEX idx_chats_contact_name_fts ON chats USING gin(to_tsvector('english', contact_name));