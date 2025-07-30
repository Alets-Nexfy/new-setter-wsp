# 🚀 WhatsApp API v2 - Complete Architecture & API Documentation

## 📋 Executive Summary

The WhatsApp API v2 is a sophisticated, enterprise-grade multi-tenant messaging automation platform featuring:

- **220+ REST API endpoints** across 19 functional modules
- **AI-powered conversation management** with Google Gemini integration
- **Multi-tier subscription system** (Standard/Professional/Enterprise)
- **Hybrid architecture** with dynamic resource allocation
- **Real-time WebSocket communication**
- **Complete user isolation** with per-user worker processes
- **Advanced CRM/Kanban integration**
- **Comprehensive analytics and monitoring**

## 🏗️ System Architecture

### Core Architecture Patterns
- **Singleton Services** - Resource sharing and management
- **Event-Driven Architecture** - Decoupled service communication
- **Multi-Tenant Design** - Complete user data isolation
- **Hybrid Resource Allocation** - Tier-based connection sharing (10:1, 3:1, 1:1)
- **Circuit Breaker Pattern** - Resilient external service integration

### Technology Stack
- **Runtime**: Node.js with TypeScript
- **Database**: Firebase Firestore (dual V1/V2 support)
- **Cache**: Redis with TTL management
- **Queue System**: Bull/Redis job queues
- **AI Integration**: Google Gemini (configurable models)
- **WhatsApp**: WhatsApp-Web.js with LocalAuth
- **WebSocket**: Real-time client communication
- **Logging**: Winston structured logging

## 📊 Service Layer Architecture

### Foundation Services (4 services)
```typescript
DatabaseService     // Firebase Firestore abstraction
CacheService       // Redis caching layer  
LoggerService      // Winston structured logging
QueueService       // Bull/Redis job processing
```

### Core Business Services (3 services)
```typescript
AIService          // Google Gemini integration
AgentService       // AI agent management
UserTierService    // Multi-tier subscription system
```

### Communication Services (3 services)
```typescript
WebSocketService        // Real-time communication
MessageBrokerService    // Central message orchestration
PromptGeneratorService  // AI prompt generation wizard
```

### Platform Services (3 services)
```typescript
WhatsAppService         // Platform abstraction
WhatsAppSessionManager  // Session lifecycle
WhatsAppMessageHandler  // Message processing
```

### Advanced Services (4 services)
```typescript
WorkerManagerService    // Cross-platform coordination
WhatsAppWorkerManager   // Process management
WhatsAppConnectionPool  // Tier-based optimization
HybridArchitecture     // Resource allocation orchestration
```

## 🌐 Complete API Reference

### 1. 🏥 Infrastructure & Health

#### System Health & Status
```http
GET    /health                    # System health check
GET    /general/info              # System information
GET    /general/stats             # System statistics  
GET    /general/queue-status      # Queue system status
GET    /ai/status                 # AI service status
```

### 2. 👤 User Management (20 endpoints)

#### User CRUD Operations
```http
POST   /users                     # Create user
GET    /users                     # List users (with filtering)
GET    /users/{userId}            # Get specific user
PUT    /users/{userId}            # Update user
DELETE /users/{userId}            # Delete user
```

#### User Operations & Status
```http
POST   /users/{userId}/connect           # Connect user
POST   /users/{userId}/disconnect        # Disconnect user
GET    /users/{userId}/status            # Get user status
GET    /users/{userId}/health            # User health check
GET    /users/{userId}/config            # Get user configuration
PUT    /users/{userId}/config            # Update user configuration
GET    /users/{userId}/activity          # Get user activity
GET    /users/{userId}/sessions          # Get user sessions
DELETE /users/{userId}/sessions/{sessionId}  # Terminate session
```

#### Worker & Analytics
```http
GET    /users/{userId}/worker            # Get worker information
POST   /users/{userId}/worker/restart    # Restart worker
GET    /analytics/users                  # User analytics
POST   /users/bulk                       # Bulk operations
POST   /users/{userId}/nuke              # Nuclear cleanup (admin)
```

### 3. 📱 WhatsApp Core (35 endpoints)

#### Connection Management (Legacy V1)
```http
POST   /api/whatsapp/{userId}/connect           # Connect to WhatsApp
POST   /api/whatsapp/{userId}/disconnect        # Disconnect from WhatsApp
GET    /api/whatsapp/{userId}/status            # Get connection status
GET    /api/whatsapp/{userId}/qr                # Get QR code data
GET    /api/whatsapp/{userId}/qr/image          # Get QR code image
GET    /api/whatsapp/{userId}/qr/view           # View QR code HTML
```

#### Session Management (V2)
```http
GET    /api/whatsapp/sessions                        # Get all sessions
GET    /api/whatsapp/sessions/{sessionId}/status     # Get session status
POST   /api/whatsapp/sessions/{sessionId}/start      # Start session
POST   /api/whatsapp/sessions/{sessionId}/stop       # Stop session
DELETE /api/whatsapp/sessions/{sessionId}            # Delete session
GET    /api/whatsapp/sessions/{sessionId}/stats      # Session statistics
```

#### Messaging (V1 & V2)
```http
POST   /api/whatsapp/{userId}/send-message           # Send message (legacy)
POST   /api/whatsapp/{userId}/send                   # Send message (alias)
POST   /api/whatsapp/sessions/{sessionId}/messages   # Send message (V2)
POST   /api/whatsapp/sessions/{sessionId}/media      # Send media (V2)
GET    /api/whatsapp/sessions/{sessionId}/messages   # Get messages (V2)
GET    /api/whatsapp/sessions/{sessionId}/messages/{messageId}  # Get message (V2)
```

#### Chat Management
```http
GET    /api/whatsapp/chats/{userId}                      # Get user chats
GET    /api/whatsapp/chats/{userId}/{chatId}             # Get specific chat
POST   /api/whatsapp/chats/{userId}/{chatId}/activate    # Activate chat
POST   /api/whatsapp/chats/{userId}/{chatId}/deactivate  # Deactivate chat
PUT    /api/whatsapp/chats/{userId}/{chatId}/contact-name  # Update contact
POST   /api/whatsapp/chats/{userId}/reset-activations    # Reset activations
POST   /api/whatsapp/chats/{userId}/bulk-operation       # Bulk operations
GET    /api/whatsapp/chats/{userId}/statistics           # Chat statistics
```

#### Message Management
```http
GET    /api/whatsapp/messages/{userId}/{chatId}              # Get messages
GET    /api/whatsapp/messages/{userId}/{chatId}/{messageId}  # Get message
POST   /api/whatsapp/messages/{userId}/{chatId}             # Send message (broker)
GET    /api/whatsapp/messages/{userId}/{chatId}/conversation-history  # History
DELETE /api/whatsapp/messages/{userId}/{chatId}/clear-history  # Clear history
GET    /api/whatsapp/messages/{userId}/{chatId}/statistics   # Message stats
```

#### Worker Management
```http
PUT    /api/whatsapp/{userId}/active-agent     # Set active agent
POST   /api/whatsapp/{userId}/pause            # Pause bot
GET    /api/whatsapp/workers/stats             # Worker statistics
POST   /api/whatsapp/workers/cleanup          # Cleanup workers
POST   /api/whatsapp/webhook/{sessionId}      # Handle webhooks
```

### 4. 🤖 AI Agents (12 endpoints)

#### Agent CRUD
```http
GET    /agents/{userId}/agents           # Get user agents
GET    /agents/{userId}/agents/{agentId} # Get specific agent
POST   /agents/{userId}/agents           # Create agent
PUT    /agents/{userId}/agents/{agentId} # Update agent
DELETE /agents/{userId}/agents/{agentId} # Delete agent
```

#### Active Agent Management
```http
GET    /agents/{userId}/active-agent     # Get active agent
PUT    /agents/{userId}/active-agent     # Set active agent
```

#### Agent Operations
```http
GET    /agents/{userId}/agents/statistics  # Agent statistics
POST   /agents/validate-config             # Validate agent config
GET    /agents/default-config              # Get default config
```

### 5. 🧠 AI Services (10 endpoints)

#### AI Response Generation
```http
POST   /ai/generate-response                    # Generate AI response
POST   /ai/{userId}/conversation-response      # Generate conversation response
POST   /ai/starter-response                    # Generate starter response
POST   /ai/generate-assisted-prompt           # Generate assisted prompt
POST   /ai/{userId}/build-prompt              # Build conversation prompt
```

#### Rate Limiting & Tracking
```http
GET    /ai/{userId}/rate-limit-status         # Get rate limit status
GET    /ai/{userId}/token-tracking/{chatId}   # Get token tracking
DELETE /ai/{userId}/rate-limit                # Clear rate limit
```

### 6. 📝 Prompt Generator (8 endpoints)
*Requires JWT Authentication*

#### Session Management
```http
POST   /prompt-generator/sessions              # Create generation session
GET    /prompt-generator/sessions              # Get user sessions
GET    /prompt-generator/sessions/{sessionId}  # Get session details
DELETE /prompt-generator/sessions/{sessionId}  # Delete session
```

#### Interactive Generation
```http
GET    /prompt-generator/sessions/{sessionId}/current-question  # Get current question
POST   /prompt-generator/sessions/{sessionId}/answer           # Answer question
POST   /prompt-generator/sessions/{sessionId}/generate         # Generate final prompt
```

#### Prompt Management
```http
GET    /prompt-generator/prompts              # Get user prompts
GET    /prompt-generator/prompts/{promptId}   # Get specific prompt
```

### 7. 💰 Tier Management (8 endpoints)
*Requires JWT Authentication*

#### Tier Information
```http
GET    /tier-management/current      # Get current tier
GET    /tier-management/tiers        # Get available tiers
```

#### Tier Operations
```http
POST   /tier-management/upgrade      # Upgrade tier
POST   /tier-management/downgrade    # Downgrade tier
PUT    /tier-management/usage        # Update usage metrics
```

#### Cost Management
```http
GET    /tier-management/cost-analysis      # Get cost analysis
POST   /tier-management/optimize-costs     # Optimize costs
GET    /tier-management/usage-warnings     # Get usage warnings
GET    /tier-management/recommendations    # Get recommendations
```

### 8. ⚡ Initial Triggers (11 endpoints)
*Requires Token Authentication*

#### Trigger Management
```http
POST   /initial-triggers                 # Create trigger
GET    /initial-triggers/{triggerId}     # Get trigger by ID
GET    /initial-triggers/user/{userId}   # Get user triggers
PUT    /initial-triggers/{triggerId}     # Update trigger
DELETE /initial-triggers/{triggerId}     # Delete trigger
```

#### Trigger Operations
```http
PATCH  /initial-triggers/{triggerId}/toggle     # Toggle trigger status
POST   /initial-triggers/{triggerId}/execute    # Execute trigger
POST   /initial-triggers/{triggerId}/duplicate  # Duplicate trigger
```

#### Analytics & Testing
```http
GET    /initial-triggers/user/{userId}/stats    # Get trigger statistics
POST   /initial-triggers/test/conditions        # Test trigger conditions
```

### 9. 🎛️ Bot Control (12 endpoints)
*Requires Token Authentication*

#### Bot Management
```http
POST   /bot-control                                      # Create bot control
GET    /bot-control/user/{userId}/platform/{platform}   # Get bot control
GET    /bot-control/user/{userId}                        # Get all user controls
PUT    /bot-control/{botControlId}                       # Update control
DELETE /bot-control/{botControlId}                       # Delete control
```

#### Bot Operations
```http
POST   /bot-control/user/{userId}/platform/{platform}/pause   # Pause bot
POST   /bot-control/user/{userId}/platform/{platform}/resume  # Resume bot
POST   /bot-control/user/{userId}/platform/{platform}/stop    # Stop bot
PATCH  /bot-control/user/{userId}/platform/{platform}/activity  # Update activity
```

#### Admin Operations
```http
GET    /bot-control/stats/overview      # Get all bot statuses (admin)
GET    /bot-control/inactive            # Get inactive bots (admin)
POST   /bot-control/cleanup/old         # Cleanup old controls (admin)
```

### 10. 📋 Kanban/CRM (25 endpoints)
*Requires Authentication*

#### Board Management
```http
POST   /kanban/boards           # Create board
GET    /kanban/boards           # Get boards
GET    /kanban/boards/{boardId} # Get specific board
PUT    /kanban/boards/{boardId} # Update board
DELETE /kanban/boards/{boardId} # Delete board
```

#### Column Management
```http
POST   /kanban/boards/{boardId}/columns              # Create column
PUT    /kanban/boards/{boardId}/columns/{columnId}   # Update column
DELETE /kanban/boards/{boardId}/columns/{columnId}   # Delete column
POST   /kanban/boards/{boardId}/columns/reorder      # Reorder columns
```

#### Card Management
```http
POST   /kanban/boards/{boardId}/columns/{columnId}/cards        # Create card
GET    /kanban/boards/{boardId}/cards/{cardId}                  # Get card
PUT    /kanban/boards/{boardId}/cards/{cardId}                  # Update card
POST   /kanban/boards/{boardId}/cards/{cardId}/move             # Move card
DELETE /kanban/boards/{boardId}/cards/{cardId}                  # Delete card
POST   /kanban/boards/{boardId}/columns/{columnId}/cards/reorder # Reorder cards
```

#### Comments & Collaboration
```http
POST   /kanban/boards/{boardId}/cards/{cardId}/comments/{commentId}   # Add comment
PUT    /kanban/boards/{boardId}/cards/{cardId}/comments/{commentId}   # Update comment
DELETE /kanban/boards/{boardId}/cards/{cardId}/comments/{commentId}   # Delete comment
```

#### Analytics & Search
```http
GET    /kanban/boards/{boardId}/search                   # Search cards
GET    /kanban/boards/{boardId}/stats                    # Board statistics
GET    /kanban/boards/{boardId}/columns/{columnId}/stats # Column statistics
GET    /kanban/boards/{boardId}/cards/{cardId}/activity  # Card activity
GET    /kanban/boards/{boardId}/activity                 # Board activity
```

### 11. 📊 Analytics & Statistics (8 endpoints)
*Requires API Key Authentication*

#### Statistics Endpoints
```http
GET    /statistics/users/{userId}/statistics    # User statistics
GET    /statistics/statistics/system            # System statistics
GET    /statistics/statistics/messages          # Message analytics
GET    /statistics/statistics/agents            # Agent analytics
GET    /statistics/statistics/realtime          # Real-time statistics
GET    /statistics/statistics/dashboard         # Dashboard statistics
```

#### Reporting
```http
POST   /statistics/statistics/reports   # Generate statistics report
GET    /statistics/statistics/export    # Export statistics data
GET    /statistics/statistics/health    # Health check
```

### 12. 🔔 Notifications (10 endpoints)
*Requires Token Authentication*

#### Notification Management
```http
POST   /notifications                     # Create notification
GET    /notifications/user/{userId}       # Get user notifications
GET    /notifications/{notificationId}    # Get specific notification
DELETE /notifications/{notificationId}    # Delete notification
DELETE /notifications/user/{userId}/all   # Delete all user notifications
```

#### Notification Operations
```http
PATCH  /notifications/{notificationId}/read    # Mark as read
PATCH  /notifications/user/{userId}/read-all   # Mark all as read
GET    /notifications/user/{userId}/unread-count  # Get unread count
```

#### Admin Operations
```http
POST   /notifications/system            # Send system notification (admin)
GET    /notifications/stats/overview    # Get notification statistics
POST   /notifications/cleanup/expired   # Cleanup expired notifications
```

### 13. 🔧 Automation Rules (8 endpoints)
*Requires API Key Authentication*

#### Rule Management
```http
GET    /automation-rules/users/{userId}/rules            # Get user rules
POST   /automation-rules/users/{userId}/rules            # Create rule
GET    /automation-rules/users/{userId}/rules/{ruleId}   # Get specific rule
PUT    /automation-rules/users/{userId}/rules/{ruleId}   # Update rule
DELETE /automation-rules/users/{userId}/rules/{ruleId}   # Delete rule
```

#### Rule Operations
```http
PATCH  /automation-rules/users/{userId}/rules/{ruleId}/toggle  # Toggle rule
POST   /automation-rules/users/{userId}/rules/bulk             # Bulk operations
```

#### Analytics
```http
GET    /automation-rules/users/{userId}/rules/statistics   # Rule statistics
GET    /automation-rules/users/{userId}/rules/health       # Health check
```

### 14. 🔄 Action Flows (12 endpoints)
*Multiple implementations available*

#### Flow Management
```http
GET    /action-flows/users/{userId}/action-flows            # Get user flows
POST   /action-flows/users/{userId}/action-flows            # Create flow
GET    /action-flows/users/{userId}/action-flows/{flowId}   # Get specific flow
PUT    /action-flows/users/{userId}/action-flows/{flowId}   # Update flow
DELETE /action-flows/users/{userId}/action-flows/{flowId}   # Delete flow
```

#### Flow Operations
```http
POST   /action-flows/users/{userId}/action-flows/{flowId}/execute    # Execute flow
PATCH  /action-flows/users/{userId}/action-flows/{flowId}/toggle     # Toggle flow
POST   /action-flows/users/{userId}/action-flows/{flowId}/duplicate  # Duplicate flow
```

#### Analytics & Management
```http
GET    /action-flows/users/{userId}/action-flows/statistics           # Statistics
POST   /action-flows/users/{userId}/action-flows/bulk                 # Bulk operations
GET    /action-flows/users/{userId}/action-flows/{flowId}/executions  # Execution history
GET    /action-flows/users/{userId}/action-flows/health               # Health check
```

### 15. 🔥 Firebase Functions (11 endpoints)
*Requires Token Authentication*

#### Function Management
```http
POST   /firebase-functions              # Create function
GET    /firebase-functions/{functionId} # Get function by ID
GET    /firebase-functions              # Get all functions
PUT    /firebase-functions/{functionId} # Update function
DELETE /firebase-functions/{functionId} # Delete function
```

#### Deployment Operations
```http
POST   /firebase-functions/{functionId}/deploy    # Deploy function
POST   /firebase-functions/{functionId}/undeploy  # Undeploy function
PATCH  /firebase-functions/{functionId}/toggle    # Toggle function status
```

#### Monitoring & Development
```http
GET    /firebase-functions/{functionId}/logs           # Get function logs
GET    /firebase-functions/{functionId}/stats          # Get function statistics
GET    /firebase-functions/stats/overview              # Get all statistics
POST   /firebase-functions/validate                    # Validate function code
```

### 16. 💬 Chat Extensions (10 endpoints)
*Requires Token Authentication*

#### Extension Management
```http
POST   /chat-extensions                    # Create chat extension
GET    /chat-extensions/{extensionId}      # Get extension by ID
GET    /chat-extensions/user/{userId}      # Get user extensions
PUT    /chat-extensions/{extensionId}      # Update extension
DELETE /chat-extensions/{extensionId}      # Delete extension
```

#### Extension Operations
```http
PATCH  /chat-extensions/{extensionId}/toggle     # Toggle extension
PATCH  /chat-extensions/{extensionId}/usage      # Increment usage
POST   /chat-extensions/{extensionId}/duplicate  # Duplicate extension
```

#### Discovery & Analytics
```http
GET    /chat-extensions/user/{userId}/popular  # Get popular extensions
GET    /chat-extensions/user/{userId}/search   # Search extensions
GET    /chat-extensions/user/{userId}/stats    # Get statistics
```

### 17. 📷 Instagram Platform (15 endpoints)
*Requires Token Authentication with Aggressive Rate Limiting*

#### Authentication & Sessions
```http
POST   /instagram/login                      # Instagram login (5/5min)
POST   /instagram/logout/{sessionId}         # Logout from session
GET    /instagram/session/{sessionId}        # Get session info
GET    /instagram/sessions/{userId}          # Get user sessions
PUT    /instagram/session/{sessionId}        # Update session settings
DELETE /instagram/session/{sessionId}        # Deactivate session
```

#### Messaging
```http
POST   /instagram/message                                        # Send message (30/min)
POST   /instagram/messages/bulk                                  # Send bulk messages (5/5min)
GET    /instagram/conversation/{conversationId}/messages         # Get conversation messages
GET    /instagram/session/{sessionId}/conversations              # Get user conversations
PUT    /instagram/message/{messageId}/read                       # Mark message as read
DELETE /instagram/message/{messageId}                            # Delete message
GET    /instagram/session/{sessionId}/messages/stats             # Message statistics
```

#### Social Actions
```http
POST   /instagram/actions/like      # Like post (50/min)
POST   /instagram/actions/comment   # Comment on post (20/min)
POST   /instagram/actions/follow    # Follow user (30/min)
```

#### Analytics
```http
GET    /instagram/sessions/stats                    # Session statistics
GET    /instagram/sessions/can-create/{userId}      # Check if can create session
```

### 18. ☢️ Nuclear Cleanup (6 endpoints)
*Requires API Key Authentication - HIGH RISK OPERATIONS*

#### System Operations
```http
GET    /nuclear-cleanup/cleanup/status         # Get system status
GET    /nuclear-cleanup/cleanup/statistics     # Get cleanup statistics
GET    /nuclear-cleanup/cleanup/health         # Health check
```

#### Nuclear Operations
```http
POST   /nuclear-cleanup/nuke-all-users                    # Nuclear cleanup all users
POST   /nuclear-cleanup/users/{userId}/nuke               # Nuclear cleanup specific user
GET    /nuclear-cleanup/users/{userId}/cleanup/verify    # Verify user cleanup
```

### 19. 🛠️ General Utilities (5 endpoints)

#### System Operations
```http
GET    /general/health        # Health check
GET    /general/info          # System information
GET    /general/stats         # System statistics
GET    /general/queue-status  # Queue status
POST   /general/webhook       # Handle webhooks
POST   /general/broadcast     # Broadcast message
POST   /general/cleanup       # System cleanup
```

## 🔐 Authentication & Security

### Authentication Types
1. **JWT Authentication** (2 modules)
   - Prompt Generator
   - Tier Management

2. **Token Authentication** (6 modules)
   - Bot Control
   - Initial Triggers
   - Notifications
   - Chat Extensions
   - Firebase Functions
   - Instagram

3. **API Key Authentication** (4 modules)
   - Automation Rules
   - Action Flows (Route A)
   - Statistics
   - Nuclear Cleanup

4. **No Authentication** (7 modules)
   - WhatsApp Core
   - AI Agents
   - AI Services
   - Action Flows (Route B)
   - General Utilities
   - User Management
   - Kanban

### Rate Limiting Patterns
- **Conservative**: 200 requests per 15 minutes (standard)
- **Moderate**: 50 requests per 15 minutes (secure operations)
- **Aggressive**: 5-50 requests per timeframe (Instagram, high-risk operations)
- **Strict**: 5-10 requests per hour (nuclear operations, admin functions)

### Security Features
- Input sanitization (Zod validation)
- CORS configuration
- Rate limiting per endpoint type
- Request/response logging
- Error handling with structured logging
- Circuit breaker patterns for external services

## 🚀 Production Deployment Checklist

### ✅ Infrastructure Requirements
- [ ] Redis server running (port 6379)
- [ ] Firebase Firestore configured
- [ ] Google Gemini API key configured
- [ ] Node.js 18+ with PM2 process manager
- [ ] SSL/TLS certificates for HTTPS
- [ ] Load balancer configuration
- [ ] Monitoring and alerting setup

### ✅ Configuration
- [ ] Environment variables set for production
- [ ] JWT secrets changed from defaults
- [ ] API keys rotated
- [ ] CORS origins restricted to production domains
- [ ] Rate limiting configured for production load
- [ ] Log levels set appropriately
- [ ] Database backup strategy implemented

### ✅ Security
- [ ] All default passwords changed
- [ ] API authentication enabled where required
- [ ] Rate limiting active
- [ ] Input validation enabled
- [ ] HTTPS enforced
- [ ] Security headers configured
- [ ] Firewall rules applied

### ✅ Monitoring
- [ ] Health check endpoints monitored
- [ ] Error rate alerts configured
- [ ] Performance metrics tracked
- [ ] Log aggregation setup
- [ ] Database performance monitored
- [ ] Queue system monitored

### ✅ Testing
- [ ] All 220+ endpoints tested
- [ ] Load testing completed
- [ ] Security testing passed
- [ ] User isolation verified
- [ ] Failover scenarios tested
- [ ] Performance benchmarks met

## 📈 Performance Specifications

### Response Time Targets
- **Health Checks**: < 100ms
- **Database Operations**: < 500ms
- **AI Generation**: < 2000ms
- **File Operations**: < 1000ms
- **Complex Analytics**: < 3000ms

### Scalability Targets
- **Concurrent Users**: 10,000+
- **Messages per Second**: 1,000+
- **API Requests per Second**: 5,000+
- **Database Connections**: 100+ concurrent
- **Memory Usage**: < 2GB per instance
- **CPU Usage**: < 80% under normal load

### Resource Allocation by Tier
- **Standard**: 50MB RAM, 0.1 CPU cores, 10:1 connection sharing
- **Professional**: 100MB RAM, 0.25 CPU cores, 3:1 connection sharing  
- **Enterprise**: 200MB RAM, 0.5 CPU cores, 1:1 dedicated connections

## 🔧 Maintenance & Operations  

### Regular Maintenance Tasks
- Weekly database cleanup
- Monthly log rotation
- Quarterly security updates
- Bi-annual dependency updates
- Annual architecture review

### Monitoring Dashboards
- System health and uptime
- API response times and error rates
- User activity and growth metrics
- Resource utilization (CPU, memory, storage)
- Queue lengths and processing times
- AI service usage and costs

### Backup Strategy
- **Database**: Real-time replication + daily snapshots
- **Configuration**: Version controlled in Git
- **Logs**: Centralized with 30-day retention
- **Media Files**: Cloud storage with versioning
- **Code**: Git with tagged releases

---

*This documentation covers the complete WhatsApp API v2 system. For specific implementation details, refer to the source code and comprehensive test suite.*

**Last Updated**: Based on architecture analysis as of 2025-07-30