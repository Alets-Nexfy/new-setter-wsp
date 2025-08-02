import { EventEmitter } from 'events';
import { LoggerService } from '@/core/services/LoggerService';
import { SupabaseService } from '@/core/services/SupabaseService';
import { CacheService } from '@/core/services/CacheService';
import { UserTierService } from '@/core/services/UserTierService';
import Queue from 'bull';
import { createClient } from 'redis';
import { v4 as uuidv4 } from 'uuid';

export interface IncomingMessage {
  id: string;
  userId: string;
  from: string;
  to: string;
  body: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'location' | 'contact';
  timestamp: Date;
  hasMedia: boolean;
  mediaUrl?: string;
  mediaType?: string;
  caption?: string;
  isFromMe: boolean;
  isGroup: boolean;
  groupId?: string;
  participantId?: string;
  quotedMessageId?: string;
  metadata: {
    chatId: string;
    messageId: string;
    serialized: string;
  };
}

export interface OutgoingMessage {
  id: string;
  userId: string;
  to: string;
  body: string;
  type: 'text' | 'media';
  mediaUrl?: string;
  caption?: string;
  options?: any;
  priority: 'low' | 'medium' | 'high';
  scheduled?: Date;
  retryCount: number;
  maxRetries: number;
}

export interface AIProcessingRequest {
  messageId: string;
  userId: string;
  incomingMessage: IncomingMessage;
  context: {
    chatHistory: IncomingMessage[];
    userProfile: any;
    activeAgent?: any;
    automationRules: any[];
  };
  priority: 'low' | 'medium' | 'high';
}

export interface AIResponse {
  requestId: string;
  userId: string;
  response: string;
  confidence: number;
  shouldSend: boolean;
  actions: Array<{
    type: 'reply' | 'forward' | 'tag' | 'webhook' | 'escalate';
    data: any;
  }>;
  processingTime: number;
  tokensUsed: number;
}

export interface UserPresenceEvent {
  userId: string;
  chatId: string;
  isPresent: boolean;
  lastActivity: Date;
  detectionMethod: 'typing' | 'online' | 'recent_message' | 'manual';
  confidence: number;
}

export interface MessageEvent {
  id: string;
  type: 'message:incoming' | 'message:outgoing' | 'message:delivered' | 'message:read' | 
        'ai:request' | 'ai:response' | 'user:presence' | 'connection:status' | 
        'automation:trigger' | 'webhook:outgoing' | 'system:notification';
  userId: string;
  timestamp: Date;
  data: any;
  priority: 'low' | 'medium' | 'high';
  processed: boolean;
  retryCount: number;
  correlationId?: string;
}

export class MessageEventBus extends EventEmitter {
  private logger: LoggerService;
  private firebase: FirebaseService;
  private cache: CacheService;
  private tierService: UserTierService;
  private redis: any;
  
  // Bull queues for different priorities and types
  private highPriorityQueue: Queue;
  private mediumPriorityQueue: Queue;
  private lowPriorityQueue: Queue;
  private aiProcessingQueue: Queue;
  private webhookQueue: Queue;
  private scheduledMessageQueue: Queue;
  
  // Event processors
  private eventProcessors: Map<string, Function> = new Map();
  
  // Metrics and monitoring
  private metrics = {
    totalEvents: 0,
    processedEvents: 0,
    failedEvents: 0,
    averageProcessingTime: 0,
    eventsPerSecond: 0,
    lastReset: new Date()
  };

  private isShuttingDown = false;
  private metricsInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    
    // Configure EventEmitter for high-throughput message processing
    this.setMaxListeners(200);
    
    this.logger = LoggerService.getInstance();
    this.firebase = SupabaseService.getInstance();
    this.cache = CacheService.getInstance();
    this.tierService = new UserTierService();
    
    this.initializeRedis();
    this.initializeQueues();
    this.setupEventProcessors();
    this.startMetricsCollection();
  }

  private async initializeRedis(): Promise<void> {
    this.redis = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      db: parseInt(process.env.BULL_REDIS_DB || '1')
    });

    await this.redis.connect();
    this.logger.info('Redis connected for event bus');
  }

  private initializeQueues(): void {
    const redisConfig = {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        db: parseInt(process.env.BULL_REDIS_DB || '1')
      }
    };

    // Priority-based message queues
    this.highPriorityQueue = new Queue('high-priority-messages', redisConfig);
    this.mediumPriorityQueue = new Queue('medium-priority-messages', redisConfig);
    this.lowPriorityQueue = new Queue('low-priority-messages', redisConfig);
    
    // Specialized queues
    this.aiProcessingQueue = new Queue('ai-processing', redisConfig);
    this.webhookQueue = new Queue('webhook-delivery', redisConfig);
    this.scheduledMessageQueue = new Queue('scheduled-messages', redisConfig);

    this.setupQueueProcessors();
    this.logger.info('Event queues initialized');
  }

  private setupQueueProcessors(): void {
    // High priority processor (enterprise users)
    this.highPriorityQueue.process('process-message', 10, async (job: Job) => {
      return await this.processMessageEvent(job.data, 'high');
    });

    // Medium priority processor (professional users)
    this.mediumPriorityQueue.process('process-message', 5, async (job: Job) => {
      return await this.processMessageEvent(job.data, 'medium');
    });

    // Low priority processor (standard users)
    this.lowPriorityQueue.process('process-message', 2, async (job: Job) => {
      return await this.processMessageEvent(job.data, 'low');
    });

    // AI processing queue
    this.aiProcessingQueue.process('ai-request', 3, async (job: Job) => {
      return await this.processAIRequest(job.data);
    });

    // Webhook delivery queue
    this.webhookQueue.process('webhook-delivery', 5, async (job: Job) => {
      return await this.processWebhookDelivery(job.data);
    });

    // Scheduled messages queue
    this.scheduledMessageQueue.process('scheduled-message', 1, async (job: Job) => {
      return await this.processScheduledMessage(job.data);
    });

    this.setupQueueEventHandlers();
  }

  private setupQueueEventHandlers(): void {
    const queues = [
      this.highPriorityQueue,
      this.mediumPriorityQueue,
      this.lowPriorityQueue,
      this.aiProcessingQueue,
      this.webhookQueue,
      this.scheduledMessageQueue
    ];

    queues.forEach(queue => {
      queue.on('completed', (job: Job, result: any) => {
        this.metrics.processedEvents++;
        this.emit('job:completed', { queueName: queue.name, jobId: job.id, result });
      });

      queue.on('failed', (job: Job, error: Error) => {
        this.metrics.failedEvents++;
        this.logger.error('Queue job failed', { 
          queueName: queue.name, 
          jobId: job.id, 
          error: error.message 
        });
        this.emit('job:failed', { queueName: queue.name, jobId: job.id, error });
      });

      queue.on('stalled', (job: Job) => {
        this.logger.warn('Queue job stalled', { queueName: queue.name, jobId: job.id });
      });
    });
  }

  private setupEventProcessors(): void {
    // Message event processors
    this.eventProcessors.set('message:incoming', this.processIncomingMessage.bind(this));
    this.eventProcessors.set('message:outgoing', this.processOutgoingMessage.bind(this));
    this.eventProcessors.set('ai:request', this.processAIRequestEvent.bind(this));
    this.eventProcessors.set('ai:response', this.processAIResponseEvent.bind(this));
    this.eventProcessors.set('user:presence', this.processUserPresenceEvent.bind(this));
    this.eventProcessors.set('automation:trigger', this.processAutomationTrigger.bind(this));
    this.eventProcessors.set('webhook:outgoing', this.processOutgoingWebhook.bind(this));
    this.eventProcessors.set('system:notification', this.processSystemNotification.bind(this));
  }

  // PUBLIC API: Event emission and routing
  public async emitMessage(event: MessageEvent): Promise<string> {
    try {
      // Validate user tier and enforce limits
      const tierInfo = await this.tierService.getUserTier(event.userId);
      const canProcess = await this.tierService.enforceResourceLimits(
        event.userId, 
        'messages_per_minute', 
        1
      );

      if (!canProcess) {
        throw new Error('Message rate limit exceeded for user tier');
      }

      // Generate unique event ID
      event.id = event.id || uuidv4();
      event.timestamp = new Date();
      event.processed = false;
      event.retryCount = 0;

      // Determine priority based on user tier
      const priority = this.determinePriority(tierInfo.tier, event.type);
      event.priority = priority;

      // Route to appropriate queue
      await this.routeEventToQueue(event, priority);

      // Update metrics
      this.metrics.totalEvents++;

      // Emit for real-time listeners
      this.emit('event:emitted', event);

      this.logger.debug('Event emitted', { 
        eventId: event.id, 
        type: event.type, 
        userId: event.userId, 
        priority 
      });

      return event.id;

    } catch (error) {
      this.logger.error('Failed to emit event', { event, error });
      throw error;
    }
  }

  public async emitIncomingMessage(message: IncomingMessage): Promise<string> {
    const event: MessageEvent = {
      id: uuidv4(),
      type: 'message:incoming',
      userId: message.userId,
      timestamp: new Date(),
      data: message,
      priority: 'medium',
      processed: false,
      retryCount: 0
    };

    return await this.emitMessage(event);
  }

  public async emitAIRequest(request: AIProcessingRequest): Promise<string> {
    const event: MessageEvent = {
      id: uuidv4(),
      type: 'ai:request',
      userId: request.userId,
      timestamp: new Date(),
      data: request,
      priority: request.priority,
      processed: false,
      retryCount: 0
    };

    return await this.emitMessage(event);
  }

  public async emitUserPresence(presence: UserPresenceEvent): Promise<string> {
    const event: MessageEvent = {
      id: uuidv4(),
      type: 'user:presence',
      userId: presence.userId,
      timestamp: new Date(),
      data: presence,
      priority: 'low',
      processed: false,
      retryCount: 0
    };

    return await this.emitMessage(event);
  }

  public async scheduleMessage(message: OutgoingMessage, scheduledTime: Date): Promise<string> {
    const delay = scheduledTime.getTime() - Date.now();
    
    if (delay <= 0) {
      // Send immediately
      return await this.emitOutgoingMessage(message);
    }

    // Schedule for later
    const job = await this.scheduledMessageQueue.add(
      'scheduled-message',
      message,
      { delay }
    );

    this.logger.info('Message scheduled', { 
      messageId: message.id, 
      userId: message.userId, 
      scheduledTime 
    });

    return job.id.toString();
  }

  public async emitOutgoingMessage(message: OutgoingMessage): Promise<string> {
    const event: MessageEvent = {
      id: uuidv4(),
      type: 'message:outgoing',
      userId: message.userId,
      timestamp: new Date(),
      data: message,
      priority: message.priority,
      processed: false,
      retryCount: 0
    };

    return await this.emitMessage(event);
  }

  // PRIVATE: Event routing and processing
  private determinePriority(tier: string, eventType: string): 'low' | 'medium' | 'high' {
    // Enterprise users get high priority
    if (tier === 'enterprise') {
      return 'high';
    }

    // Professional users get medium priority for most events
    if (tier === 'professional') {
      return eventType.includes('ai:') ? 'medium' : 'medium';
    }

    // Standard users get low priority
    return 'low';
  }

  private async routeEventToQueue(event: MessageEvent, priority: 'low' | 'medium' | 'high'): Promise<void> {
    let queue: Queue;

    // Route AI requests to specialized queue
    if (event.type.startsWith('ai:')) {
      queue = this.aiProcessingQueue;
    } else if (event.type === 'webhook:outgoing') {
      queue = this.webhookQueue;
    } else {
      // Route to priority-based queues
      switch (priority) {
        case 'high':
          queue = this.highPriorityQueue;
          break;
        case 'medium':
          queue = this.mediumPriorityQueue;
          break;
        case 'low':
        default:
          queue = this.lowPriorityQueue;
          break;
      }
    }

    // Add job to queue with retry logic
    const jobOptions = {
      attempts: parseInt(process.env.BULL_MAX_ATTEMPTS || '3'),
      backoff: {
        type: 'exponential',
        delay: parseInt(process.env.BULL_BACKOFF_DELAY || '5000')
      },
      removeOnComplete: 100,
      removeOnFail: 50
    };

    await queue.add('process-message', event, jobOptions);
  }

  // MESSAGE PROCESSORS
  private async processMessageEvent(event: MessageEvent, priority: string): Promise<any> {
    const startTime = Date.now();
    
    try {
      this.logger.debug('Processing message event', { 
        eventId: event.id, 
        type: event.type, 
        priority 
      });

      // Get the appropriate processor
      const processor = this.eventProcessors.get(event.type);
      if (!processor) {
        throw new Error(`No processor found for event type: ${event.type}`);
      }

      // Process the event
      const result = await processor(event);

      // Mark as processed
      event.processed = true;
      event.timestamp = new Date();

      // Update processing time metrics
      const processingTime = Date.now() - startTime;
      this.updateProcessingTimeMetrics(processingTime);

      // Cache the result for potential replay
      await this.cacheEventResult(event.id, result);

      this.emit('event:processed', { event, result, processingTime });

      return result;

    } catch (error) {
      this.logger.error('Error processing message event', { 
        eventId: event.id, 
        type: event.type, 
        error: error.message 
      });

      // Increment retry count
      event.retryCount++;

      // Emit error event
      this.emit('event:error', { event, error });

      throw error;
    }
  }

  private async processIncomingMessage(event: MessageEvent): Promise<any> {
    const message = event.data as IncomingMessage;
    
    // Store message in database
    await this.firebase.collection('messages').add({
      ...message,
      processed: true,
      processedAt: new Date()
    });

    // Check for human presence
    const presenceEvent: UserPresenceEvent = {
      userId: message.userId,
      chatId: message.metadata.chatId,
      isPresent: await this.detectHumanPresence(message),
      lastActivity: new Date(),
      detectionMethod: 'recent_message',
      confidence: 0.8
    };

    await this.emitUserPresence(presenceEvent);

    // Check if AI response is needed
    if (!message.isFromMe && !presenceEvent.isPresent) {
      const aiRequest: AIProcessingRequest = {
        messageId: message.id,
        userId: message.userId,
        incomingMessage: message,
        context: await this.buildMessageContext(message),
        priority: event.priority
      };

      await this.emitAIRequest(aiRequest);
    }

    // Check automation rules
    await this.checkAutomationRules(message);

    // Update user activity
    await this.tierService.updateUsage(message.userId, {
      messagesThisMonth: 1,
      lastActivity: new Date()
    });

    return { messageId: message.id, processed: true };
  }

  private async processOutgoingMessage(event: MessageEvent): Promise<any> {
    const message = event.data as OutgoingMessage;
    
    // Send message through connection pool
    // This would integrate with your WhatsAppConnectionPool
    this.emit('message:send', message);

    // Store in database
    await this.firebase.collection('messages').add({
      ...message,
      direction: 'outgoing',
      sentAt: new Date()
    });

    return { messageId: message.id, sent: true };
  }

  private async processAIRequestEvent(event: MessageEvent): Promise<any> {
    // This is handled by the AI processing queue
    return await this.routeEventToQueue(event, event.priority);
  }

  private async processAIRequest(data: AIProcessingRequest): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Check if AI responses are enabled for this user tier
      const canUseAI = await this.tierService.isFeatureEnabled(data.userId, 'aiResponses');
      if (!canUseAI) {
        this.logger.warn('AI responses not enabled for user tier', { userId: data.userId });
        return { error: 'AI responses not available for your plan' };
      }

      // Generate AI response (integrate with your AIService)
      const aiResponse = await this.generateAIResponse(data);

      // Emit AI response event
      const responseEvent: MessageEvent = {
        id: uuidv4(),
        type: 'ai:response',
        userId: data.userId,
        timestamp: new Date(),
        data: aiResponse,
        priority: data.priority,
        processed: false,
        retryCount: 0,
        correlationId: data.messageId
      };

      await this.emitMessage(responseEvent);

      return aiResponse;

    } catch (error) {
      this.logger.error('AI request processing failed', { 
        messageId: data.messageId, 
        userId: data.userId, 
        error 
      });
      throw error;
    }
  }

  private async processAIResponseEvent(event: MessageEvent): Promise<any> {
    const aiResponse = event.data as AIResponse;
    
    if (aiResponse.shouldSend) {
      // Create outgoing message
      const outgoingMessage: OutgoingMessage = {
        id: uuidv4(),
        userId: aiResponse.userId,
        to: '', // This should be determined from context
        body: aiResponse.response,
        type: 'text',
        priority: event.priority,
        retryCount: 0,
        maxRetries: 3
      };

      await this.emitOutgoingMessage(outgoingMessage);
    }

    // Execute additional actions
    for (const action of aiResponse.actions) {
      await this.executeAction(action, aiResponse.userId);
    }

    return { processed: true, actions: aiResponse.actions.length };
  }

  private async processUserPresenceEvent(event: MessageEvent): Promise<any> {
    const presence = event.data as UserPresenceEvent;
    
    // Cache presence information
    const cacheKey = `presence:${presence.userId}:${presence.chatId}`;
    await this.cache.set(cacheKey, presence, 300); // 5 minutes cache

    // Store in database for analytics
    await this.firebase.collection('user_presence').add({
      ...presence,
      recordedAt: new Date()
    });

    // Emit presence update
    this.emit('presence:updated', presence);

    return { presenceUpdated: true };
  }

  private async processAutomationTrigger(event: MessageEvent): Promise<any> {
    // Process automation rules
    const automationData = event.data;
    
    // This would integrate with your automation system
    this.logger.info('Processing automation trigger', { 
      userId: event.userId, 
      trigger: automationData 
    });

    return { automationTriggered: true };
  }

  private async processOutgoingWebhook(event: MessageEvent): Promise<any> {
    // Route to webhook queue for delivery
    return await this.routeEventToQueue(event, 'medium');
  }

  private async processWebhookDelivery(webhookData: any): Promise<any> {
    // Implement webhook delivery logic
    this.logger.info('Delivering webhook', { webhook: webhookData });
    return { delivered: true };
  }

  private async processScheduledMessage(message: OutgoingMessage): Promise<any> {
    // Send the scheduled message
    return await this.emitOutgoingMessage(message);
  }

  private async processSystemNotification(event: MessageEvent): Promise<any> {
    // Handle system notifications
    const notification = event.data;
    
    this.logger.info('Processing system notification', { 
      userId: event.userId, 
      notification 
    });

    return { notificationProcessed: true };
  }

  // HELPER METHODS
  private async detectHumanPresence(message: IncomingMessage): Promise<boolean> {
    // Simple presence detection - enhance this based on your needs
    const cacheKey = `presence:${message.userId}:${message.metadata.chatId}`;
    const cachedPresence = await this.cache.get(cacheKey);
    
    if (cachedPresence) {
      const presence = JSON.parse(cachedPresence);
      const timeSinceLastActivity = Date.now() - new Date(presence.lastActivity).getTime();
      
      // Consider human present if activity within last 2 minutes
      return timeSinceLastActivity < 2 * 60 * 1000;
    }

    return false;
  }

  private async buildMessageContext(message: IncomingMessage): Promise<any> {
    // Build context for AI processing
    const chatHistory = await this.getChatHistory(message.userId, message.metadata.chatId, 10);
    const userProfile = await this.getUserProfile(message.userId);
    const activeAgent = await this.getActiveAgent(message.userId);
    const automationRules = await this.getAutomationRules(message.userId);

    return {
      chatHistory,
      userProfile,
      activeAgent,
      automationRules
    };
  }

  private async getChatHistory(userId: string, chatId: string, limit: number): Promise<IncomingMessage[]> {
    try {
      const messages = await this.firebase.collection('messages')
        .where('userId', '==', userId)
        .where('metadata.chatId', '==', chatId)
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

      return messages.docs.map(doc => doc.data() as IncomingMessage);
    } catch (error) {
      this.logger.error('Error getting chat history', { userId, chatId, error });
      return [];
    }
  }

  private async getUserProfile(userId: string): Promise<any> {
    try {
      const profile = await this.firebase.getDocument(`user_profiles/${userId}`);
      return profile || {};
    } catch (error) {
      this.logger.error('Error getting user profile', { userId, error });
      return {};
    }
  }

  private async getActiveAgent(userId: string): Promise<any> {
    try {
      const agents = await this.firebase.collection('agents')
        .where('userId', '==', userId)
        .where('isActive', '==', true)
        .limit(1)
        .get();

      return agents.docs.length > 0 ? agents.docs[0].data() : null;
    } catch (error) {
      this.logger.error('Error getting active agent', { userId, error });
      return null;
    }
  }

  private async getAutomationRules(userId: string): Promise<any[]> {
    try {
      const rules = await this.firebase.collection('automation_rules')
        .where('userId', '==', userId)
        .where('active', '==', true)
        .get();

      return rules.docs.map(doc => doc.data());
    } catch (error) {
      this.logger.error('Error getting automation rules', { userId, error });
      return [];
    }
  }

  private async checkAutomationRules(message: IncomingMessage): Promise<void> {
    const rules = await this.getAutomationRules(message.userId);
    
    for (const rule of rules) {
      if (this.matchesRule(message, rule)) {
        const automationEvent: MessageEvent = {
          id: uuidv4(),
          type: 'automation:trigger',
          userId: message.userId,
          timestamp: new Date(),
          data: { rule, message },
          priority: 'medium',
          processed: false,
          retryCount: 0
        };

        await this.emitMessage(automationEvent);
      }
    }
  }

  private matchesRule(message: IncomingMessage, rule: any): boolean {
    // Simple rule matching - enhance based on your automation system
    if (rule.trigger === 'message_contains') {
      const keywords = rule.keywords || [];
      return keywords.some((keyword: string) => 
        message.body.toLowerCase().includes(keyword.toLowerCase())
      );
    }
    
    return false;
  }

  private async generateAIResponse(request: AIProcessingRequest): Promise<AIResponse> {
    // This would integrate with your AI service
    // For now, return a mock response
    return {
      requestId: request.messageId,
      userId: request.userId,
      response: 'This is a mock AI response',
      confidence: 0.85,
      shouldSend: true,
      actions: [],
      processingTime: 1000,
      tokensUsed: 50
    };
  }

  private async executeAction(action: any, userId: string): Promise<void> {
    this.logger.info('Executing AI action', { action, userId });
    
    switch (action.type) {
      case 'webhook':
        await this.emitMessage({
          id: uuidv4(),
          type: 'webhook:outgoing',
          userId,
          timestamp: new Date(),
          data: action.data,
          priority: 'medium',
          processed: false,
          retryCount: 0
        });
        break;
        
      case 'escalate':
        // Handle escalation
        break;
        
      // Add more action types as needed
    }
  }

  private async cacheEventResult(eventId: string, result: any): Promise<void> {
    const cacheKey = `event_result:${eventId}`;
    await this.cache.set(cacheKey, JSON.stringify(result), 3600); // 1 hour cache
  }

  private updateProcessingTimeMetrics(processingTime: number): void {
    const currentAvg = this.metrics.averageProcessingTime;
    const processedCount = this.metrics.processedEvents;
    
    this.metrics.averageProcessingTime = processedCount === 0 ? 
      processingTime : 
      ((currentAvg * (processedCount - 1)) + processingTime) / processedCount;
  }

  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      this.calculateEventsPerSecond();
      this.emit('metrics:updated', this.metrics);
    }, 60000); // Every minute
  }

  private calculateEventsPerSecond(): void {
    const now = new Date();
    const timeDiff = (now.getTime() - this.metrics.lastReset.getTime()) / 1000;
    
    if (timeDiff > 0) {
      this.metrics.eventsPerSecond = this.metrics.totalEvents / timeDiff;
    }

    // Reset counters every hour
    if (timeDiff > 3600) {
      this.metrics.totalEvents = 0;
      this.metrics.processedEvents = 0;
      this.metrics.failedEvents = 0;
      this.metrics.lastReset = now;
    }
  }

  // PUBLIC API: Monitoring and management
  public getMetrics(): any {
    return {
      ...this.metrics,
      queues: {
        highPriority: {
          waiting: this.highPriorityQueue.waiting,
          active: this.highPriorityQueue.active,
          completed: this.highPriorityQueue.completed,
          failed: this.highPriorityQueue.failed
        },
        mediumPriority: {
          waiting: this.mediumPriorityQueue.waiting,
          active: this.mediumPriorityQueue.active,
          completed: this.mediumPriorityQueue.completed,
          failed: this.mediumPriorityQueue.failed
        },
        lowPriority: {
          waiting: this.lowPriorityQueue.waiting,
          active: this.lowPriorityQueue.active,
          completed: this.lowPriorityQueue.completed,
          failed: this.lowPriorityQueue.failed
        },
        aiProcessing: {
          waiting: this.aiProcessingQueue.waiting,
          active: this.aiProcessingQueue.active,
          completed: this.aiProcessingQueue.completed,
          failed: this.aiProcessingQueue.failed
        }
      }
    };
  }

  public async pauseProcessing(): Promise<void> {
    await this.highPriorityQueue.pause();
    await this.mediumPriorityQueue.pause();
    await this.lowPriorityQueue.pause();
    await this.aiProcessingQueue.pause();
    await this.webhookQueue.pause();
    
    this.logger.info('Event processing paused');
  }

  public async resumeProcessing(): Promise<void> {
    await this.highPriorityQueue.resume();
    await this.mediumPriorityQueue.resume();
    await this.lowPriorityQueue.resume();
    await this.aiProcessingQueue.resume();
    await this.webhookQueue.resume();
    
    this.logger.info('Event processing resumed');
  }

  public async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    this.logger.info('Shutting down message event bus...');

    // Clear metrics interval
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    // Close all queues
    const queues = [
      this.highPriorityQueue,
      this.mediumPriorityQueue,
      this.lowPriorityQueue,
      this.aiProcessingQueue,
      this.webhookQueue,
      this.scheduledMessageQueue
    ];

    await Promise.all(queues.map(queue => queue.close()));

    // Close Redis connection
    await this.redis.quit();

    this.logger.info('Message event bus shutdown completed');
    this.emit('bus:shutdown');
  }
}