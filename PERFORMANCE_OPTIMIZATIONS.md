# WhatsApp API v2 - Performance Optimizations for Multiple Users

## System Architecture Overview

The system is optimized for handling multiple users simultaneously with tier-based resource allocation:

### 1. Connection Pool Architecture (WhatsAppConnectionPool.ts)

**Standard Tier Users (Shared Pool)**
- 10 users per WhatsApp connection
- Cost-optimized resource sharing
- Pool size: 20 connections (supports 200 concurrent users)

**Professional Tier Users (Semi-Dedicated Pool)**  
- 3 users per WhatsApp connection
- Better isolation and performance
- Pool size: 50 connections (supports 150 concurrent professional users)

**Enterprise Tier Users (Dedicated Workers)**
- 1 dedicated worker per user
- Complete isolation and maximum performance
- Unlimited scaling based on server resources

### 2. EventEmitter Optimizations

**Configured Max Listeners:**
- WhatsAppConnectionPool: 100 listeners
- MessageEventBus: 200 listeners  
- WhatsAppWorker: 50 listeners per instance
- PM2 Node args: `--max-listeners=200`

### 3. Redis Connection Optimizations

**Connection Pooling:**
- Keep-alive: 30 seconds
- Connect timeout: 10 seconds
- Command queue max length: 1000
- Max retries per request: 3
- Lazy connection strategy

### 4. PM2 Configuration Optimizations

**Resource Allocation:**
- Memory limit increased to 4GB (was 2GB)
- Node.js heap size: 4GB
- Max HTTP header size: 16KB
- EventEmitter limit: 200

**Process Management:**
- Single fork mode (required for WhatsApp Web.js)
- Auto-restart on memory limit
- Graceful shutdown timeout: 60 seconds

### 5. Message Processing Queue System

**Priority-Based Processing:**
- High Priority Queue: Enterprise users (10 concurrent workers)
- Medium Priority Queue: Professional users (5 concurrent workers)  
- Low Priority Queue: Standard users (2 concurrent workers)
- AI Processing Queue: 3 concurrent workers
- Webhook Queue: 5 concurrent workers

### 6. Auto-Scaling Features

**Dynamic Pool Management:**
- Automatic slot creation based on demand
- Unused slot cleanup (30 min for shared, 15 min for semi-dedicated)
- Health checks every 30 seconds
- Pool optimization every 5 minutes

**Resource Monitoring:**
- Real-time metrics collection
- Cost-per-user calculation
- Resource utilization tracking
- Automatic scaling triggers

### 7. Memory Leak Prevention

**EventEmitter Management:**
- Proper listener cleanup on disconnect
- Maximum listener limits configured
- Event handler removal on shutdown

**Connection Cleanup:**
- Automatic session cleanup on inactivity (36 hours)
- Graceful client destruction
- Process cleanup on worker exit

### 8. Multi-Agent System Optimizations

**Agent Switching Performance:**
- AI response cache clearing after agent switches
- Context preservation during switches
- Trigger evaluation caching
- Agent state isolation per user

### 9. Network Optimizations

**Nginx Configuration:**
- SSL/TLS termination
- Connection pooling
- Rate limiting for WhatsApp API endpoints
- WebSocket support for real-time connections

### 10. Database Optimizations

**Firestore Performance:**
- User data isolation by userId
- Efficient query patterns
- Caching layer with Redis
- Automatic retry mechanisms

## Capacity Estimates

Based on current optimizations:

**Theoretical Capacity:**
- Standard users: 200 concurrent (20 shared pools × 10 users)
- Professional users: 150 concurrent (50 semi-dedicated × 3 users)  
- Enterprise users: Limited by server RAM/CPU

**Realistic Capacity (with 4GB RAM limit):**
- ~50-100 concurrent active users
- ~200-500 total registered users
- Depends on message volume and AI usage

## Monitoring & Alerts

**Key Metrics to Monitor:**
- Memory usage (should stay under 3.5GB)
- Connection pool utilization
- Message processing queue lengths
- Redis connection status
- EventEmitter listener counts

**Performance Indicators:**
- Average response time < 2 seconds
- Queue processing rate
- Cache hit ratio
- User session distribution across pools

## Scaling Recommendations

**Horizontal Scaling:**
- Deploy multiple instances behind load balancer
- Separate Redis cluster for caching
- Database read replicas for analytics

**Vertical Scaling:**
- Increase server RAM to 8GB+ for more users
- Add more CPU cores for AI processing
- Faster SSD storage for session data