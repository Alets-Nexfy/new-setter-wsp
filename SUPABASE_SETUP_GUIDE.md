# 🚀 GUÍA COMPLETA: SETUP ENTORNO SUPABASE

## 🎯 PASO 1: CREACIÓN DEL PROYECTO SUPABASE

### 1.1 Acceso a Supabase Dashboard
```bash
# Visitar: https://supabase.com/dashboard
# 1. Crear cuenta o iniciar sesión
# 2. Click "New Project"
# 3. Configurar proyecto:
#    - Name: "whatsapp-api-v2-db"
#    - Organization: Tu organización
#    - Region: us-east-1 (o más cercana)
#    - Database Password: [GENERAR PASSWORD SEGURO]
```

### 1.2 Configuración Inicial del Proyecto
```sql
-- Configuraciones básicas de PostgreSQL
ALTER DATABASE postgres SET timezone TO 'UTC';
ALTER DATABASE postgres SET log_statement TO 'all';
ALTER DATABASE postgres SET log_min_duration_statement TO 100;
```

## 🗄️ PASO 2: INSTALACIÓN DE DEPENDENCIAS

### 2.1 Instalar Supabase Client
```bash
cd /root/new-setter-wsp
npm install @supabase/supabase-js
npm install --save-dev @types/node
```

### 2.2 Actualizar package.json (Preservando Firebase temporalmente)
```json
{
  "dependencies": {
    "firebase-admin": "^12.7.0",
    "@supabase/supabase-js": "^2.39.0",
    "pg": "^8.11.3",
    "@types/pg": "^8.10.9"
  }
}
```

## 🔧 PASO 3: CONFIGURACIÓN DE SUPABASE CLIENT

### 3.1 Crear archivo de configuración
```typescript
// src/core/config/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      'x-application-name': 'whatsapp-api-v2'
    }
  }
})

// Para operaciones de administración
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  db: {
    schema: 'public'
  }
})

export default supabase
```

### 3.2 Variables de Entorno
```bash
# .env - Agregar variables Supabase
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Mantener Firebase temporalmente para migración gradual
FIREBASE_PROJECT_ID=your-firebase-project
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
```

## 🏗️ PASO 4: CREACIÓN DEL SCHEMA DE BASE DE DATOS

### 4.1 Habilitar Extensiones Necesarias
```sql
-- Enable necessary PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "unaccent";
```

### 4.2 Crear Tablas Principales
```sql
-- ================================
-- USERS TABLE
-- ================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    tier VARCHAR(50) NOT NULL DEFAULT 'standard' CHECK (tier IN ('standard', 'professional', 'enterprise', 'enterprise_b2b')),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    settings JSONB DEFAULT '{}',
    b2b_info JSONB DEFAULT NULL
);

-- ================================
-- SESSIONS TABLE
-- ================================
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('whatsapp', 'instagram')),
    status VARCHAR(50) NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connecting', 'connected', 'disconnected', 'error')),
    qr_code TEXT,
    session_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

-- ================================
-- CHATS TABLE
-- ================================
CREATE TABLE chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('whatsapp', 'instagram')),
    contact_id VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255) NOT NULL,
    last_message TEXT,
    last_message_time TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    is_archived BOOLEAN DEFAULT FALSE,
    labels TEXT[] DEFAULT '{}',
    assigned_agent UUID,
    current_flow UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

-- ================================
-- MESSAGES TABLE
-- ================================
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('whatsapp', 'instagram')),
    from_contact VARCHAR(255) NOT NULL,
    to_contact VARCHAR(255) NOT NULL,
    message_type VARCHAR(50) NOT NULL CHECK (message_type IN ('text', 'image', 'video', 'audio', 'document', 'location', 'contact')),
    content TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(50) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
    metadata JSONB DEFAULT '{}'
);

-- ================================
-- AGENTS TABLE
-- ================================
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    agent_type VARCHAR(100) NOT NULL CHECK (agent_type IN ('customer_service', 'sales', 'support', 'custom')),
    config JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    performance JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================
-- AGENT_TRIGGERS TABLE
-- ================================
CREATE TABLE agent_triggers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    trigger_type VARCHAR(100) NOT NULL,
    trigger_config JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================
-- KANBAN_BOARDS TABLE
-- ================================
CREATE TABLE kanban_boards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================
-- KANBAN_COLUMNS TABLE
-- ================================
CREATE TABLE kanban_columns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    board_id UUID NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    color VARCHAR(7),
    card_limit INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================
-- KANBAN_CARDS TABLE
-- ================================
CREATE TABLE kanban_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    column_id UUID NOT NULL REFERENCES kanban_columns(id) ON DELETE CASCADE,
    board_id UUID NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chat_id UUID REFERENCES chats(id) ON DELETE SET NULL,
    contact_name VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    labels TEXT[] DEFAULT '{}',
    due_date TIMESTAMP WITH TIME ZONE,
    assignee VARCHAR(255),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================
-- NOTIFICATIONS TABLE
-- ================================
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL CHECK (notification_type IN ('info', 'warning', 'error', 'success')),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    action_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'
);

-- ================================
-- AUTOMATION_RULES TABLE
-- ================================
CREATE TABLE automation_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    trigger_config JSONB NOT NULL,
    action_config JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    execution_count INTEGER DEFAULT 0,
    last_execution TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================
-- ACTION_FLOWS TABLE
-- ================================
CREATE TABLE action_flows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    flow_config JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    execution_count INTEGER DEFAULT 0,
    last_execution TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================
-- FIREBASE_FUNCTIONS TABLE (Para migración gradual)
-- ================================
CREATE TABLE firebase_functions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    code TEXT NOT NULL,
    runtime VARCHAR(50) DEFAULT 'nodejs18',
    memory INTEGER DEFAULT 256,
    timeout INTEGER DEFAULT 60,
    trigger_config JSONB NOT NULL,
    environment_variables JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    version INTEGER DEFAULT 1,
    deployment_status VARCHAR(50) DEFAULT 'pending',
    last_deployment TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 4.3 Crear Índices para Performance
```sql
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
```

### 4.4 Crear Triggers para Updated_At
```sql
-- ================================
-- AUTO UPDATE TIMESTAMPS
-- ================================

-- Create function to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to all tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_chats_updated_at BEFORE UPDATE ON chats FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_kanban_boards_updated_at BEFORE UPDATE ON kanban_boards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_kanban_columns_updated_at BEFORE UPDATE ON kanban_columns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_kanban_cards_updated_at BEFORE UPDATE ON kanban_cards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_automation_rules_updated_at BEFORE UPDATE ON automation_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_action_flows_updated_at BEFORE UPDATE ON action_flows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_firebase_functions_updated_at BEFORE UPDATE ON firebase_functions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

## 🔐 PASO 5: CONFIGURACIÓN DE ROW LEVEL SECURITY (RLS)

### 5.1 Habilitar RLS en todas las tablas
```sql
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
```

### 5.2 Crear Políticas de Seguridad
```sql
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
```

## 🚀 PASO 6: CREAR SERVICIOS SUPABASE

### 6.1 Crear SupabaseService (Equivalente a DatabaseService)
```typescript
// src/core/services/SupabaseService.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/supabase-types'

export class SupabaseService {
  private static instance: SupabaseService
  private client: SupabaseClient<Database>
  private adminClient: SupabaseClient<Database>
  private initialized = false

  private constructor() {
    // Supabase will be initialized in the initialize() method
  }

  public static getInstance(): SupabaseService {
    if (!SupabaseService.instance) {
      SupabaseService.instance = new SupabaseService()
    }
    return SupabaseService.instance
  }

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      const supabaseUrl = process.env.SUPABASE_URL
      const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

      if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
        throw new Error('Missing required Supabase environment variables')
      }

      // Initialize client for regular operations
      this.client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      })

      // Initialize admin client for admin operations
      this.adminClient = createClient<Database>(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      })

      this.initialized = true
      console.log('[SupabaseService] Supabase initialized successfully')

    } catch (error) {
      console.error('[SupabaseService] Failed to initialize Supabase:', error)
      throw new Error(`Supabase initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      if (!this.initialized) {
        return false
      }
      
      // Simple query to test connection
      const { error } = await this.client.from('users').select('id').limit(1)
      return !error
    } catch (error) {
      console.error('[SupabaseService] Health check failed:', error)
      return false
    }
  }

  public getClient(): SupabaseClient<Database> {
    if (!this.initialized) {
      throw new Error('SupabaseService not initialized. Call initialize() first.')
    }
    return this.client
  }

  public getAdminClient(): SupabaseClient<Database> {
    if (!this.initialized) {
      throw new Error('SupabaseService not initialized. Call initialize() first.')
    }
    return this.adminClient
  }

  // Helper methods for common operations
  public from(table: keyof Database['public']['Tables']) {
    return this.getClient().from(table)
  }

  public adminFrom(table: keyof Database['public']['Tables']) {
    return this.getAdminClient().from(table)
  }
}
```

## 📝 PASO 7: CONFIGURACIÓN DE STORAGE

### 7.1 Crear Buckets de Storage
```sql
-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('user-uploads', 'user-uploads', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-media', 'chat-media', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('qr-codes', 'qr-codes', false);
```

### 7.2 Configurar Storage Policies
```sql
-- Storage policies
CREATE POLICY "Users can upload their own files" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'user-uploads' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own files" ON storage.objects FOR SELECT USING (
  bucket_id = 'user-uploads' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);
```

## ✅ PASO 8: VALIDACIÓN DEL SETUP

### 8.1 Test de Conexión
```typescript
// scripts/test-supabase-connection.ts
import { SupabaseService } from '../src/core/services/SupabaseService'

async function testConnection() {
  const supabaseService = SupabaseService.getInstance()
  
  try {
    await supabaseService.initialize()
    const isHealthy = await supabaseService.healthCheck()
    
    if (isHealthy) {
      console.log('✅ Supabase connection successful!')
    } else {
      console.log('❌ Supabase connection failed!')
    }
  } catch (error) {
    console.error('❌ Error testing connection:', error)
  }
}

testConnection()
```

### 8.2 Test de Operaciones Básicas
```typescript
// Test basic CRUD operations
const testUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  name: 'Test User',
  tier: 'standard' as const
}

// Create
const { data: createdUser } = await supabase
  .from('users')
  .insert(testUser)
  .select()
  .single()

console.log('✅ User created:', createdUser)

// Read
const { data: readUser } = await supabase
  .from('users')
  .select('*')
  .eq('id', testUser.id)
  .single()

console.log('✅ User read:', readUser)

// Update
const { data: updatedUser } = await supabase
  .from('users')
  .update({ name: 'Updated Test User' })
  .eq('id', testUser.id)
  .select()
  .single()

console.log('✅ User updated:', updatedUser)

// Delete
await supabase
  .from('users')
  .delete()
  .eq('id', testUser.id)

console.log('✅ User deleted')
```

## 🎯 CHECKLIST DE SETUP COMPLETADO

- [ ] ✅ Proyecto Supabase creado
- [ ] ✅ Dependencias NPM instaladas
- [ ] ✅ Variables de entorno configuradas
- [ ] ✅ Schema de base de datos creado
- [ ] ✅ Índices de performance creados
- [ ] ✅ Triggers de timestamps configurados
- [ ] ✅ RLS habilitado y políticas creadas
- [ ] ✅ SupabaseService implementado
- [ ] ✅ Storage buckets configurados
- [ ] ✅ Tests de conexión exitosos
- [ ] ✅ Tests de operaciones básicas exitosos

## 🚨 SIGUIENTE PASO: BACKUP DE DATOS FIREBASE

Una vez completado este setup, el siguiente paso será crear un backup completo de todos los datos de Firebase antes de proceder con la migración de datos.