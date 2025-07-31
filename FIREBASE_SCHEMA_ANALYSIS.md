# 🔥 ANÁLISIS COMPLETO FIREBASE SCHEMA

## COLECCIONES PRINCIPALES

### 1. **users** (Collection)
```typescript
interface User {
  id: string;
  email: string;
  name: string;
  tier: 'standard' | 'professional' | 'enterprise' | 'enterprise_b2b';
  status: 'active' | 'inactive' | 'suspended';
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastActivity: Timestamp;
  settings?: UserSettings;
  b2bInfo?: B2BInfo; // Para usuarios enterprise_b2b
}
```

**Subcolecciones de users/{userId}/:**
- `chats/` - Chats del usuario
- `agents/` - Agentes IA configurados
- `rules/` - Reglas de automatización
- `action_flows/` - Flujos de acción
- `initial_triggers/` - Triggers iniciales
- `status/` - Estado del usuario
- `instagram_chats/` - Chats de Instagram

### 2. **sessions** (Collection)
```typescript
interface Session {
  id: string;
  userId: string;
  platform: 'whatsapp' | 'instagram';
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  qrCode?: string;
  sessionData?: any;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastActivity: Timestamp;
  metadata?: SessionMetadata;
}
```

### 3. **messages** (Collection)
```typescript
interface Message {
  id: string;
  sessionId: string;
  userId: string;
  platform: 'whatsapp' | 'instagram';
  chatId: string;
  from: string;
  to: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document';
  content: string;
  timestamp: Timestamp;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  metadata?: MessageMetadata;
}
```

### 4. **users/{userId}/chats/{chatId}/** (Subcollection)
```typescript
interface Chat {
  id: string;
  userId: string;
  platform: 'whatsapp' | 'instagram';
  contactId: string;
  contactName: string;
  lastMessage?: string;
  lastMessageTime?: Timestamp;
  isActive: boolean;
  isArchived: boolean;
  labels?: string[];
  assignedAgent?: string;
  currentFlow?: string;
  metadata?: ChatMetadata;
}
```

**Subcolecciones de chats/{chatId}/:**
- `messages/` - Mensajes del chat
- `messages_contact/` - Mensajes del contacto
- `messages_all/` - Todos los mensajes
- `messages_human/` - Mensajes humanos
- `messages_bot/` - Mensajes del bot

### 5. **users/{userId}/agents/{agentId}/** (Subcollection)
```typescript
interface Agent {
  id: string;
  userId: string;
  name: string;
  type: 'customer_service' | 'sales' | 'support' | 'custom';
  config: AgentConfig;
  isActive: boolean;
  isDefault: boolean;
  triggers: AgentTrigger[];
  performance?: AgentPerformance;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 6. **kanban_boards** (Collection)
```typescript
interface KanbanBoard {
  id: string;
  userId: string;
  name: string;
  description?: string;
  isDefault: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 7. **kanban_columns** (Collection)
```typescript
interface KanbanColumn {
  id: string;
  boardId: string;
  userId: string;
  name: string;
  position: number;
  color?: string;
  limit?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 8. **kanban_cards** (Collection)
```typescript
interface KanbanCard {
  id: string;
  columnId: string;
  boardId: string;
  userId: string;
  chatId: string;
  contactName: string;
  title: string;
  description?: string;
  position: number;
  labels?: string[];
  dueDate?: Timestamp;
  assignee?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 9. **notifications** (Collection)
```typescript
interface Notification {
  id: string;
  userId: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  isRead: boolean;
  priority: 'low' | 'medium' | 'high';
  actionUrl?: string;
  metadata?: NotificationMetadata;
  createdAt: Timestamp;
  expiresAt?: Timestamp;
}
```

### 10. **firebaseFunctions** (Collection)
```typescript
interface FirebaseFunction {
  id: string;
  userId: string;
  name: string;
  description?: string;
  code: string;
  runtime: 'nodejs14' | 'nodejs16' | 'nodejs18';
  memory: 128 | 256 | 512 | 1024 | 2048;
  timeout: number;
  trigger: FunctionTrigger;
  environmentVariables?: Record<string, string>;
  isActive: boolean;
  version: number;
  deploymentStatus: 'pending' | 'deployed' | 'failed';
  lastDeployment?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

## ÍNDICES IMPLÍCITOS DETECTADOS

### Índices por Colección:
- **sessions**: `(userId, platform, status)`
- **messages**: `(sessionId, platform, timestamp)`
- **users/{userId}/chats**: `(platform, isActive, lastMessageTime)`
- **notifications**: `(userId, isRead, createdAt)`
- **kanban_cards**: `(boardId, columnId, position)`

## PATRONES DE CONSULTA FRECUENTES

### 1. **Consultas de Sesiones**
```typescript
// Buscar sesiones activas por usuario
.where('userId', '==', userId)
.where('platform', '==', platform)
.where('status', '==', 'connected')

// Limpiar sesiones inactivas
.where('platform', '==', platform)
.where('lastActivity', '<', cutoffTime)
```

### 2. **Consultas de Mensajes**
```typescript
// Obtener mensajes de chat con filtros
.where('sessionId', '==', sessionId)
.where('platform', '==', platform)
.orderBy('timestamp', 'desc')
.limit(50)

// Filtros por tipo y fecha
.where('type', '==', messageType)
.where('timestamp', '>=', startDate)
.where('timestamp', '<=', endDate)
```

### 3. **Consultas de Chats**
```typescript
// Chats activos del usuario
.where('userId', '==', userId)
.where('isActive', '==', true)
.orderBy('lastMessageTime', 'desc')

// Chats por plataforma
.where('platform', '==', platform)
.where('isArchived', '==', false)
```

## OPERACIONES TRANSACCIONALES

### Transacciones Identificadas:
1. **Creación de usuario con configuración inicial**
2. **Actualización de estado de sesión con metadata**
3. **Movimiento de tarjetas Kanban**
4. **Ejecución de flujos de acción**

## ESTIMACIÓN DE VOLUMEN DE DATOS

### Por Usuario Promedio:
- **Chats**: 50-200 documentos
- **Mensajes**: 1,000-10,000 documentos
- **Agentes**: 3-10 documentos
- **Reglas**: 5-20 documentos
- **Notificaciones**: 100-500 documentos

### Totales Estimados (1000 usuarios):
- **Users**: 1K documentos
- **Sessions**: 2-5K documentos
- **Messages**: 1-10M documentos
- **Chats**: 50-200K documentos
- **Kanban items**: 10-50K documentos

## DEPENDENCIAS CRÍTICAS

### Firebase Services Utilizados:
1. **Firestore** (100% crítico) - Base de datos principal
2. **Firebase Admin SDK** (100% crítico) - Autenticación de servidor
3. **Firebase Storage** (30% crítico) - Archivos y media
4. **Firebase Functions** (50% crítico) - Lógica serverless

### Librerías y Versiones:
- `firebase-admin: ^12.7.0`
- Node.js >= 18.0.0
- TypeScript ^5.3.2