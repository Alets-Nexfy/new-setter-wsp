# Enterprise B2B API Guide - WhatsApp Setter Service

## 🌐 **Base URL**
```
https://api.nexfy.io/api
```

## 🔒 **Authentication**
All API calls require proper authentication headers (implementation depends on your auth system).

---

# 📱 **1. WhatsApp QR Code Generation & Connection**

## Get QR Code for WhatsApp Connection
**Primary endpoint for connecting users to WhatsApp**

### Get QR Code Data
```http
GET https://api.nexfy.io/api/whatsapp/{userId}/qr
```
**Purpose**: Get QR code string and metadata for WhatsApp connection  
**Response**: Returns QR code string, expiration time, and connection status  
**Use Case**: Get raw QR data to generate custom QR displays

### Get QR Code as Image
```http
GET https://api.nexfy.io/api/whatsapp/{userId}/qr/image
```
**Purpose**: Get QR code as a PNG image  
**Response**: Returns image binary data  
**Use Case**: Direct display of QR code in web interfaces

### View QR Code in Browser
```http
GET https://api.nexfy.io/api/whatsapp/{userId}/qr/view
```
**Purpose**: Get HTML page with QR code display  
**Response**: HTML page with auto-refreshing QR code  
**Use Case**: Quick testing or simple integration

## Connection Management

### Connect User to WhatsApp
```http
POST https://api.nexfy.io/api/whatsapp/{userId}/connect
```
**Purpose**: Initiate WhatsApp connection for user  
**Body**: 
```json
{
  "autoReconnect": true,
  "timeout": 300000
}
```

### Get Connection Status
```http
GET https://api.nexfy.io/api/whatsapp/{userId}/status
```
**Purpose**: Check current WhatsApp connection status  
**Response**: 
```json
{
  "status": "qr|connecting|authenticated|disconnected",
  "phoneNumber": "+1234567890",
  "lastActivity": "2025-07-31T16:00:00Z",
  "isAuthenticated": true
}
```

### Disconnect User
```http
POST https://api.nexfy.io/api/whatsapp/{userId}/disconnect
```
**Purpose**: Safely disconnect user from WhatsApp  
**Use Case**: Clean logout, maintenance, or user request

---

# 🤖 **2. Agent Configuration & Management**

## Agent CRUD Operations

### Get All User Agents
```http
GET https://api.nexfy.io/api/agents/{userId}/agents
```
**Purpose**: Retrieve all configured agents for user  
**Response**: Array of agent objects with configurations  
**Use Case**: Display agent list in platform interface

### Get Specific Agent
```http
GET https://api.nexfy.io/api/agents/{userId}/agents/{agentId}
```
**Purpose**: Get detailed configuration of specific agent  
**Use Case**: Edit agent form, agent details view

### Create New Agent
```http
POST https://api.nexfy.io/api/agents/{userId}/agents
```
**Purpose**: Create new AI agent with custom configuration  
**Body**:
```json
{
  "name": "Sales Agent",
  "role": "sales_representative", 
  "personality": "Professional and helpful sales assistant",
  "instructions": "Help customers with product inquiries and guide them through purchase process",
  "knowledge": {
    "writingSampleTxt": "Sample of agent's writing style...",
    "files": []
  },
  "isActive": false
}
```

### Update Agent
```http
PUT https://api.nexfy.io/api/agents/{userId}/agents/{agentId}
```
**Purpose**: Update existing agent configuration  
**Body**: Same as create, with fields to update  
**Use Case**: Modify agent personality, instructions, or knowledge

### Delete Agent
```http
DELETE https://api.nexfy.io/api/agents/{userId}/agents/{agentId}
```
**Purpose**: Permanently delete agent configuration  
**Use Case**: Remove unused or outdated agents

## Active Agent Management

### Get Current Active Agent
```http
GET https://api.nexfy.io/api/agents/{userId}/active-agent
```
**Purpose**: Get currently active agent for user  
**Response**: Active agent object or null  
**Use Case**: Display current agent in UI

### Set Active Agent
```http
PUT https://api.nexfy.io/api/agents/{userId}/active-agent
```
**Purpose**: Switch to different agent  
**Body**:
```json
{
  "agentId": "agent_id_here"
}
```
**Use Case**: Manual agent switching, agent selection interface

### Pause/Resume Bot
```http
POST https://api.nexfy.io/api/whatsapp/{userId}/pause
```
**Purpose**: Temporarily pause all agent responses  
**Body**:
```json
{
  "paused": true,
  "reason": "Manual intervention needed"
}
```

## Agent Validation & Configuration

### Validate Agent Configuration
```http
POST https://api.nexfy.io/api/agents/validate-config
```
**Purpose**: Validate agent configuration before saving  
**Body**: Agent configuration object  
**Response**: Validation results and suggestions

### Get Default Agent Configuration
```http
GET https://api.nexfy.io/api/agents/default-config
```
**Purpose**: Get template/default agent configuration  
**Use Case**: Pre-populate agent creation forms

---

# 🔀 **3. Multi-Agent System (Enterprise Feature)**

## Multi-Agent Configuration

### Get Multi-Agent Configuration
```http
GET https://api.nexfy.io/api/multi-agent/{userId}/config
```
**Purpose**: Get current multi-agent setup with triggers and switching rules  
**Response**: Complete multi-agent configuration object  
**Use Case**: Display current multi-agent setup

### Create/Update Multi-Agent Configuration
```http
POST https://api.nexfy.io/api/multi-agent/{userId}/config
```
**Purpose**: Configure multi-agent system with triggers and switching logic  
**Body**:
```json
{
  "agents": [
    {
      "agentId": "sales_agent_id",
      "name": "Sales Agent",
      "isActive": true,
      "triggers": {
        "initial": [
          {
            "keyword": "pricing",
            "type": "contains",
            "priority": 10
          }
        ],
        "switch": [
          {
            "keyword": "support",
            "type": "exact",
            "priority": 5,
            "targetAgentId": "support_agent_id"
          }
        ]
      }
    }
  ],
  "globalSettings": {
    "enableContextPreservation": true,
    "switchingCooldown": 30,
    "fallbackAgentId": "default_agent_id"
  }
}
```

### Initialize Default Multi-Agent Configuration
```http
POST https://api.nexfy.io/api/multi-agent/{userId}/config/initialize
```
**Purpose**: Set up basic multi-agent configuration with default agents  
**Use Case**: Quick setup for new enterprise B2B users

## Chat-Level Agent Management

### Get Chat Agent State
```http
GET https://api.nexfy.io/api/multi-agent/{userId}/chat/{chatId}/state
```
**Purpose**: Get current agent assigned to specific chat  
**Response**: Current agent info and switch history for chat

### Switch Agent for Specific Chat
```http
POST https://api.nexfy.io/api/multi-agent/{userId}/chat/{chatId}/switch
```
**Purpose**: Manually switch agent for specific conversation  
**Body**:
```json
{
  "targetAgentId": "support_agent_id",
  "reason": "Customer requested technical support",
  "preserveContext": true
}
```

## Testing & Analytics

### Test Agent Triggers
```http
POST https://api.nexfy.io/api/multi-agent/{userId}/triggers/test
```
**Purpose**: Test trigger conditions with sample messages  
**Body**:
```json
{
  "message": "I need help with pricing",
  "chatId": "test_chat",
  "currentAgentId": "sales_agent_id"
}
```
**Response**: Which triggers would fire and resulting agent switches

### Get Multi-Agent Statistics
```http
GET https://api.nexfy.io/api/multi-agent/{userId}/stats
```
**Purpose**: Get analytics on agent usage, switches, and performance  
**Response**: Agent usage statistics, switch frequency, success rates

---

# 💬 **4. Message Management**

## Send Messages

### Send Text Message
```http
POST https://api.nexfy.io/api/whatsapp/{userId}/send-message
```
**Purpose**: Send message through active agent with AI processing  
**Body**:
```json
{
  "to": "5547999999999@c.us",
  "message": "Hello! How can I help you today?",
  "options": {
    "useAI": true,
    "agentId": "specific_agent_id" // optional
  }
}
```

### Send to Specific Chat
```http
POST https://api.nexfy.io/api/whatsapp/messages/{userId}/{chatId}
```
**Purpose**: Send message to specific chat conversation  
**Body**:
```json
{
  "message": "Thanks for your message!",
  "type": "text"
}
```

## Get Messages & History

### Get Chat Messages
```http
GET https://api.nexfy.io/api/whatsapp/messages/{userId}/{chatId}?limit=50&offset=0
```
**Purpose**: Get message history for specific chat  
**Query Params**: `limit`, `offset` for pagination  
**Use Case**: Display conversation history

### Get Conversation History
```http
GET https://api.nexfy.io/api/whatsapp/messages/{userId}/{chatId}/conversation-history
```
**Purpose**: Get formatted conversation history with agent context  
**Response**: Structured conversation data with agent information

---

# 💼 **5. B2B Enterprise User Management**

## B2B User Lifecycle

### Create B2B Enterprise User
```http
POST https://api.nexfy.io/api/b2b/users
```
**Purpose**: Create new enterprise B2B user with platform association  
**Body**:
```json
{
  "userId": "unique_user_id_123",
  "platformId": "your_platform_id",
  "platformUserId": "user_id_in_your_platform",
  "platformName": "Your Platform Name",
  "platformApiKey": "optional_callback_key"
}
```
**Response**: Complete user tier info with enterprise B2B configuration

### Get B2B User Information
```http
GET https://api.nexfy.io/api/b2b/users/{userId}
```
**Purpose**: Get complete B2B user information and configuration  
**Response**: User tier, platform info, usage statistics, feature access

### Connect B2B User to WhatsApp
```http
POST https://api.nexfy.io/api/b2b/users/{userId}/connect
```
**Purpose**: Initiate WhatsApp connection for B2B user (uses enterprise B2B pool)  
**Response**: Connection status and pool assignment information

### Get B2B User Status
```http
GET https://api.nexfy.io/api/b2b/users/{userId}/status
```
**Purpose**: Get current connection and service status for B2B user  
**Response**: Connection status, tier info, usage metrics, last activity

## Bulk Operations

### Bulk Create B2B Users
```http
POST https://api.nexfy.io/api/b2b/users/bulk
```
**Purpose**: Create multiple B2B users in single operation  
**Body**:
```json
{
  "users": [
    {"userId": "user1", "platformUserId": "puser1"},
    {"userId": "user2", "platformUserId": "puser2"}
  ],
  "platformId": "your_platform_id",
  "platformName": "Your Platform Name"
}
```

---

# 📊 **6. Analytics & Monitoring**

## User Analytics

### Get User Statistics
```http
GET https://api.nexfy.io/api/whatsapp/messages/{userId}/{chatId}/statistics
```
**Purpose**: Get detailed message and interaction statistics  
**Response**: Message counts, response times, agent performance metrics

### Get Agent Statistics
```http
GET https://api.nexfy.io/api/agents/{userId}/agents/statistics
```
**Purpose**: Get performance analytics for all user agents  
**Response**: Usage statistics, success rates, user satisfaction metrics

## Platform Analytics (B2B)

### Get Platform Statistics
```http
GET https://api.nexfy.io/api/b2b/platforms/{platformId}/stats
```
**Purpose**: Get analytics for entire platform (all users)  
**Response**:
```json
{
  "totalUsers": 150,
  "activeUsers": 89,
  "totalMessages": 12450,
  "averageMessagesPerUser": 83,
  "generatedAt": "2025-07-31T16:00:00Z"
}
```

### Get Platform Users
```http
GET https://api.nexfy.io/api/b2b/platforms/{platformId}/users?page=1&limit=50
```
**Purpose**: Get paginated list of all users from platform  
**Query Params**: `page`, `limit` for pagination  
**Use Case**: Platform dashboard, user management interface

---

# 🔧 **7. System & Utility Endpoints**

## System Health

### Health Check
```http
GET https://api.nexfy.io/api/health
```
**Purpose**: Check system status and availability  
**Response**:
```json
{
  "status": "ok",
  "timestamp": "2025-07-31T16:00:00Z",
  "version": "2.0.0"
}
```

### Get System Information
```http
GET https://api.nexfy.io/api/general/info
```
**Purpose**: Get system information and capabilities  
**Response**: System version, features, limits, configuration

## Chat Management

### Get User Chats
```http
GET https://api.nexfy.io/api/whatsapp/chats/{userId}
```
**Purpose**: Get all active chats for user  
**Response**: List of chats with contact info and last activity

### Activate/Deactivate Chat
```http
POST https://api.nexfy.io/api/whatsapp/chats/{userId}/{chatId}/activate
POST https://api.nexfy.io/api/whatsapp/chats/{userId}/{chatId}/deactivate
```
**Purpose**: Enable or disable AI responses for specific chat  
**Use Case**: Manual control over which chats receive automated responses

---

# 🚀 **Implementation Guide for Your Platform**

## **Priority Integration Order:**

### **Phase 1: Basic WhatsApp Connection**
1. **Create B2B User**: `POST /api/b2b/users`
2. **Connect to WhatsApp**: `POST /api/b2b/users/{userId}/connect`
3. **Get QR Code**: `GET /api/whatsapp/{userId}/qr/image`
4. **Check Status**: `GET /api/b2b/users/{userId}/status`

### **Phase 2: Agent Configuration**
1. **Create Default Agent**: `POST /api/agents/{userId}/agents`
2. **Set Active Agent**: `PUT /api/agents/{userId}/active-agent`
3. **Test Configuration**: `POST /api/agents/validate-config`

### **Phase 3: Multi-Agent Setup** (Enterprise Feature)
1. **Initialize Multi-Agent**: `POST /api/multi-agent/{userId}/config/initialize`
2. **Configure Triggers**: `POST /api/multi-agent/{userId}/config`
3. **Test Triggers**: `POST /api/multi-agent/{userId}/triggers/test`

### **Phase 4: Message Management**
1. **Send Messages**: `POST /api/whatsapp/{userId}/send-message`
2. **Get Chat History**: `GET /api/whatsapp/messages/{userId}/{chatId}`
3. **Manage Chats**: `GET /api/whatsapp/chats/{userId}`

### **Phase 5: Analytics & Monitoring**
1. **User Analytics**: `GET /api/agents/{userId}/agents/statistics`
2. **Platform Analytics**: `GET /api/b2b/platforms/{platformId}/stats`
3. **System Health**: `GET /api/health`

---

## **Common Integration Patterns:**

### **User Onboarding Flow:**
```javascript
// 1. Create B2B user when they sign up
const user = await createB2BUser(userData);

// 2. Connect to WhatsApp
await connectUser(user.userId);

// 3. Get QR for display
const qrImage = await getQRImage(user.userId);

// 4. Set up default agent
const agent = await createDefaultAgent(user.userId);
await setActiveAgent(user.userId, agent.id);
```

### **Multi-Agent Setup:**
```javascript
// 1. Initialize multi-agent system
await initializeMultiAgent(userId);

// 2. Configure agents with triggers
await configureMultiAgent(userId, {
  agents: [salesAgent, supportAgent],
  triggers: triggerRules
});

// 3. Test configuration
await testTriggers(userId, sampleMessages);
```

### **Monitoring & Analytics:**
```javascript
// Regular status checks
const status = await getUserStatus(userId);
const platformStats = await getPlatformStats(platformId);

// Handle connection issues
if (status.status === 'disconnected') {
  await reconnectUser(userId);
}
```

---

**🎯 Key Benefits for Enterprise B2B Integration:**
- **Complete API Coverage**: All WhatsApp and agent functionality exposed
- **Enterprise Features**: Multi-agent system, advanced analytics, priority processing
- **Platform Integration**: B2B-specific endpoints for seamless platform integration
- **Scalable Architecture**: Handles 10-100+ concurrent users efficiently
- **SSL Secured**: All endpoints available via HTTPS at api.nexfy.io

This API guide provides everything needed to integrate WhatsApp automation with intelligent agent management into your platform. Each endpoint is production-ready and optimized for enterprise B2B usage.