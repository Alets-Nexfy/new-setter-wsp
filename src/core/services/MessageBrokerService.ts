import { EventEmitter } from 'events';
import { LoggerService } from './LoggerService';
import { SupabaseService } from './SupabaseService';
import { WebSocketService } from './websocketService';
import { QueueService } from './QueueService';
import { WorkerManagerService } from './WorkerManagerService';
import { AIService } from './AIService';
import { AgentService } from './AgentService';
import { 
  Message,
  SendMessageRequest,
  MessageOrigin,
  MessageType,
  ConversationContext
} from '@/shared/types/chat';

export interface MessageJob {
  id: string;
  userId: string;
  chatId: string;
  type: 'send_message' | 'process_incoming' | 'send_bot_message' | 'send_media' | 'auto_reply';
  payload: any;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  scheduledAt?: Date;
}

export interface MessageProcessingResult {
  success: boolean;
  messageId?: string;
  error?: string;
  metadata?: any;
}

export interface AutoReplyRule {
  id: string;
  trigger: string;
  response: string;
  isActive: boolean;
  priority: number;
}

export interface GeminiStarter {
  id: string;
  trigger: string;
  prompt: string;
  isActive: boolean;
}

export interface ActionFlow {
  id: string;
  name: string;
  trigger: 'exact_message' | 'message' | 'image_received' | 'video_received' | 'any_media';
  triggerValue?: string;
  steps: any[];
  isActive: boolean;
  priority: number;
}

export interface InitialTrigger {
  id: string;
  triggerText: string;
  isActive: boolean;
  agentId: string;
}

export interface AutoReplyContext {
  userId: string;
  chatId: string;
  incomingMessage: Message;
  conversationHistory: ConversationContext;
  userPresence: {
    isActive: boolean;
    lastActivity: string;
    inactivityDuration: number;
  };
  chatActivated: boolean;
  isInitialTrigger: boolean;
}

export class MessageBrokerService extends EventEmitter {
  private static instance: MessageBrokerService;
  private logger: LoggerService;
  private db: SupabaseService;
  private wsService: WebSocketService;
  private queueService: QueueService;
  private workerManager: WorkerManagerService;
  private aiService: AIService;
  private agentService: AgentService;
  
  // Message processing queues
  private messageQueue: Map<string, MessageJob[]> = new Map();
  private processingJobs: Set<string> = new Set();
  
  // Rate limiting
  private rateLimits: Map<string, { count: number; resetTime: number }> = new Map();
  private readonly RATE_LIMIT_WINDOW = 60000; // 1 minute
  private readonly DEFAULT_RATE_LIMIT = 30; // messages per minute
  
  // Auto-reply settings
  private readonly INACTIVITY_THRESHOLD = 36 * 60 * 60 * 1000; // 36 hours
  private readonly AUTO_REPLY_DELAY = 2000; // 2 seconds

  // User configuration cache
  private userConfigCache: Map<string, {
    rules: AutoReplyRule[];
    starters: GeminiStarter[];
    flows: ActionFlow[];
    initialTriggers: InitialTrigger[];
    lastUpdated: Date;
  }> = new Map();
  private readonly CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    super();
    this.logger = LoggerService.getInstance();
    this.db = SupabaseService.getInstance();
    this.wsService = WebSocketService.getInstance();
    this.queueService = QueueService.getInstance();
    this.workerManager = WorkerManagerService.getInstance();
    this.aiService = AIService.getInstance();
    this.agentService = AgentService.getInstance();
    
    this.setupEventHandlers();
    this.startMessageProcessing();
  }

  public static getInstance(): MessageBrokerService {
    if (!MessageBrokerService.instance) {
      MessageBrokerService.instance = new MessageBrokerService();
    }
    return MessageBrokerService.instance;
  }

  /**
   * Send message through worker with queuing and retry logic
   */
  public async sendMessage(request: SendMessageRequest & { userId: string }): Promise<MessageProcessingResult> {
    try {
      const { userId, chatId, message, origin = 'human', type = 'text', metadata = {} } = request;

      this.logger.info('Message send request received', {
        userId,
        chatId,
        messageLength: message.length,
        origin,
        type
      });

      // Validate rate limits
      if (!this.checkRateLimit(userId)) {
        return {
          success: false,
          error: 'Rate limit exceeded'
        };
      }

      // Check if worker is active
      if (!this.workerManager.isWorkerActive(userId)) {
        return {
          success: false,
          error: 'Worker not active'
        };
      }

      // Create message job
      const job: MessageJob = {
        id: this.generateJobId(),
        userId,
        chatId,
        type: 'send_message',
        payload: {
          message,
          origin,
          type,
          metadata
        },
        priority: origin === 'bot' ? 'normal' : 'high',
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date()
      };

      // Queue the job
      await this.queueJob(job);

      // For human messages, send immediately
      if (origin === 'human') {
        return await this.processMessageJob(job);
      }

      return {
        success: true,
        messageId: job.id
      };

    } catch (error) {
      this.logger.error('Error in send message', {
        userId: request.userId,
        chatId: request.chatId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * MIGRADO DE: whatsapp-api/src/worker.js client.on('message') handler líneas 846-1093
   * Process incoming message with complete auto-reply logic
   */
  public async processIncomingMessage(
    userId: string,
    messageData: any
  ): Promise<MessageProcessingResult> {
    try {
      this.logger.info('Processing incoming message', {
        userId,
        from: messageData.from,
        hasMedia: messageData.hasMedia,
        bodyLength: messageData.body?.length || 0
      });

      const chatId = messageData.from;
      
      // Save incoming message to Firestore
      const messageId = await this.saveIncomingMessage(userId, chatId, messageData);

      // Update chat metadata
      await this.updateChatAfterIncomingMessage(userId, chatId, messageData);

      // Broadcast to WebSocket clients
      await this.wsService.sendToUser(userId, {
        type: 'newMessage',
        data: {
          chatId,
          message: this.transformMessageForClient(messageData, messageId),
          timestamp: new Date().toISOString()
        }
      });

      // Check if auto-reply should be triggered
      const shouldAutoReply = await this.shouldTriggerAutoReply(userId, chatId, messageData);
      
      if (shouldAutoReply.trigger) {
        // Queue auto-reply with delay
        const autoReplyJob: MessageJob = {
          id: this.generateJobId(),
          userId,
          chatId,
          type: 'auto_reply',
          payload: {
            incomingMessage: messageData,
            context: shouldAutoReply.context
          },
          priority: 'normal',
          attempts: 0,
          maxAttempts: 2,
          createdAt: new Date(),
          scheduledAt: new Date(Date.now() + this.AUTO_REPLY_DELAY)
        };

        await this.queueJob(autoReplyJob);
      }

      this.emit('messageProcessed', {
        userId,
        chatId,
        messageId,
        type: 'incoming',
        autoReplyTriggered: shouldAutoReply.trigger
      });

      return {
        success: true,
        messageId,
        metadata: {
          chatId,
          shouldAutoReply: shouldAutoReply.trigger,
          autoReplyReason: shouldAutoReply.reason
        }
      };

    } catch (error) {
      this.logger.error('Error processing incoming message', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * MIGRADO DE: whatsapp-api/src/worker.js líneas 955-1093
   * Complete auto-reply decision logic with rules, starters, flows
   */
  private async shouldTriggerAutoReply(
    userId: string,
    chatId: string,
    messageData: any
  ): Promise<{ trigger: boolean; reason?: string; context?: AutoReplyContext }> {
    try {
      // 1. Check if chat is activated
      const chatDoc = await this.db
        .collection('users')
        .doc(userId)
        .collection('chats')
        .doc(chatId)
        .get();

      const chatData = chatDoc.exists ? chatDoc.data()! : {};
      const chatIsActivated = chatData.isActivated || false;

      // 2. Check for initial triggers (can activate chat)
      const initialTriggers = await this.getInitialTriggers(userId);
      const messageText = (messageData.body || '').trim().toLowerCase();
      
      const isInitialTrigger = initialTriggers.some(trigger => {
        const triggerText = trigger.triggerText.trim().toLowerCase();
        return messageText.includes(triggerText) || messageText === triggerText;
      });

      // 3. Check user activity status
      const userIsActive = chatData.userIsActive || false;
      const lastActivityTime = chatData.lastActivityTimestamp?.toDate?.()?.getTime() || 0;
      const inactivityDuration = Date.now() - lastActivityTime;

      // 4. Check bot pause state
      const statusDoc = await this.db
        .collection('users')
        .doc(userId)
        .collection('status')
        .doc('whatsapp')
        .get();

      const botIsPaused = statusDoc.exists ? statusDoc.data()?.botIsPaused === true : false;

      this.logger.debug('Auto-reply conditions check', {
        userId,
        chatId,
        chatIsActivated,
        isInitialTrigger,
        userIsActive,
        inactivityDuration: Math.round(inactivityDuration / 1000 / 60), // minutes
        botIsPaused
      });

      // 5. Decision logic: trigger if user is inactive AND bot not paused AND (chat activated OR initial trigger)
      const userInactiveEnough = !userIsActive || inactivityDuration >= this.INACTIVITY_THRESHOLD;
      const shouldTrigger = userInactiveEnough && !botIsPaused && (chatIsActivated || isInitialTrigger);

      if (!shouldTrigger) {
        let reason = 'Conditions not met';
        if (!userInactiveEnough) reason = 'User is active';
        else if (botIsPaused) reason = 'Bot is paused';
        else if (!chatIsActivated && !isInitialTrigger) reason = 'Chat not activated and no initial trigger';

        return { trigger: false, reason };
      }

      // Build auto-reply context
      const context: AutoReplyContext = {
        userId,
        chatId,
        incomingMessage: this.transformToMessage(messageData),
        conversationHistory: await this.buildConversationContext(userId, chatId),
        userPresence: {
          isActive: userIsActive,
          lastActivity: new Date(lastActivityTime).toISOString(),
          inactivityDuration
        },
        chatActivated: chatIsActivated,
        isInitialTrigger
      };

      return { 
        trigger: true, 
        reason: isInitialTrigger ? 'Initial trigger detected' : 'Auto-reply conditions met',
        context 
      };

    } catch (error) {
      this.logger.error('Error checking auto-reply conditions', {
        userId,
        chatId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return { trigger: false, reason: 'Error checking conditions' };
    }
  }

  /**
   * MIGRADO DE: whatsapp-api/src/worker.js líneas 977-1093
   * Process auto-reply with complete flow logic
   */
  public async processAutoReply(
    userId: string,
    chatId: string,
    messageData: any,
    context: AutoReplyContext
  ): Promise<MessageProcessingResult> {
    try {
      this.logger.info('Processing auto-reply', {
        userId,
        chatId,
        isInitialTrigger: context.isInitialTrigger,
        chatActivated: context.chatActivated
      });

      // Get user configuration (rules, starters, flows)
      const config = await this.getUserConfiguration(userId);
      const messageText = (messageData.body || '').trim().toLowerCase();

      // 1. Check for matching action flows first (highest priority)
      const matchedFlow = config.flows.find(flow => {
        if (!flow.isActive) return false;

        const triggerValueLower = flow.triggerValue?.trim().toLowerCase();

        switch (flow.trigger) {
          case 'exact_message':
            return triggerValueLower && messageText === triggerValueLower;
          case 'message':
            return triggerValueLower && messageText.includes(triggerValueLower);
          case 'image_received':
            return messageData.hasMedia && messageData.type === 'image';
          case 'video_received':
            return messageData.hasMedia && messageData.type === 'video';
          case 'any_media':
            return messageData.hasMedia;
          default:
            return false;
        }
      });

      if (matchedFlow) {
        this.logger.info('Executing matched flow', {
          userId,
          chatId,
          flowId: matchedFlow.id,
          flowName: matchedFlow.name
        });

        await this.executeActionFlow(userId, chatId, matchedFlow, messageData);
        
        return {
          success: true,
          metadata: {
            responseType: 'action_flow',
            flowId: matchedFlow.id,
            flowName: matchedFlow.name
          }
        };
      }

      // 2. Check for simple rules
      const matchingRule = config.rules.find(rule => {
        if (!rule.isActive) return false;
        const triggerText = rule.trigger.trim().toLowerCase();
        return messageText.includes(triggerText) || messageText === triggerText;
      });

      if (matchingRule) {
        this.logger.info('Executing simple rule', {
          userId,
          chatId,
          ruleId: matchingRule.id,
          trigger: matchingRule.trigger
        });

        await this.sendBotMessage(userId, chatId, {
          content: matchingRule.response,
          trigger: 'simple_rule'
        });

        return {
          success: true,
          metadata: {
            responseType: 'simple_rule',
            ruleId: matchingRule.id,
            response: matchingRule.response
          }
        };
      }

      // 3. Check for Gemini conversation starters
      const matchedStarter = config.starters.find(starter => {
        if (!starter.isActive) return false;
        const triggerText = starter.trigger.trim().toLowerCase();
        return messageText.includes(triggerText) || messageText === triggerText;
      });

      if (matchedStarter) {
        this.logger.info('Executing Gemini starter', {
          userId,
          chatId,
          starterId: matchedStarter.id,
          trigger: matchedStarter.trigger
        });

        const aiResponse = await this.aiService.generateStarterResponse(matchedStarter.prompt, {
          maxRetries: 2,
          maxTokens: 500
        });

        if (aiResponse.success && aiResponse.content) {
          await this.sendBotMessage(userId, chatId, {
            content: aiResponse.content,
            trigger: 'gemini_starter'
          });

          return {
            success: true,
            metadata: {
              responseType: 'gemini_starter',
              starterId: matchedStarter.id,
              response: aiResponse.content
            }
          };
        } else {
          this.logger.warn('Gemini starter failed, falling back to default', {
            userId,
            chatId,
            error: aiResponse.error
          });
        }
      }

      // 4. Default Gemini response with conversation context
      this.logger.info('Generating default Gemini response', { userId, chatId });

      const agentConfig = await this.agentService.getAgentConfigForAI(userId);
      
      const aiResponse = await this.aiService.generateConversationResponse(
        userId,
        chatId,
        messageData.body || '',
        agentConfig,
        {
          maxRetries: 2,
          maxTokens: 800
        }
      );

      if (aiResponse.success && aiResponse.content) {
        await this.sendBotMessage(userId, chatId, {
          content: aiResponse.content,
          trigger: 'default_ai'
        });

        return {
          success: true,
          metadata: {
            responseType: 'default_ai',
            response: aiResponse.content
          }
        };
      } else {
        this.logger.error('Default Gemini response failed', {
          userId,
          chatId,
          error: aiResponse.error
        });

        // Send fallback message
        await this.sendBotMessage(userId, chatId, {
          content: 'Gracias por tu mensaje. Te responderé pronto.',
          trigger: 'fallback'
        });

        return {
          success: true,
          metadata: {
            responseType: 'fallback',
            response: 'Fallback message sent'
          }
        };
      }

    } catch (error) {
      this.logger.error('Error processing auto-reply', {
        userId,
        chatId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Send fallback message on error
      try {
        await this.sendBotMessage(userId, chatId, {
          content: 'Disculpa, hubo un problema técnico. ¿Podrías intentar de nuevo?',
          trigger: 'error_fallback'
        });
      } catch (fallbackError) {
        this.logger.error('Error sending fallback message', {
          userId,
          chatId,
          error: fallbackError instanceof Error ? fallbackError.message : 'Unknown error'
        });
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Execute action flow
   */
  private async executeActionFlow(
    userId: string,
    chatId: string,
    flow: ActionFlow,
    messageData: any
  ): Promise<void> {
    try {
      this.logger.info('Executing action flow', {
        userId,
        chatId,
        flowId: flow.id,
        flowName: flow.name,
        stepsCount: flow.steps?.length || 0
      });

      // Build execution context
      const context = {
        message: messageData,
        flow: flow,
        variables: {
          userId,
          sender: chatId,
          messageBody: messageData.body || '',
          timestamp: new Date().toISOString()
        }
      };

      // Execute steps (simplified version - full implementation would be in ActionFlowsController)
      if (!flow.steps || !Array.isArray(flow.steps) || flow.steps.length === 0) {
        this.logger.warn('Flow has no steps', { flowId: flow.id });
        await this.sendBotMessage(userId, chatId, {
          content: 'Flujo activado pero sin acciones definidas.',
          trigger: 'flow_empty'
        });
        return;
      }

      // For now, execute basic steps
      for (const step of flow.steps) {
        await this.executeFlowStep(step, context, userId, chatId);
      }

      this.logger.info('Action flow executed successfully', {
        userId,
        chatId,
        flowId: flow.id
      });

    } catch (error) {
      this.logger.error('Error executing action flow', {
        userId,
        chatId,
        flowId: flow.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Send error message
      await this.sendBotMessage(userId, chatId, {
        content: 'Lo siento, ocurrió un error al procesar tu solicitud.',
        trigger: 'flow_error'
      });
    }
  }

  /**
   * Execute individual flow step (simplified)
   */
  private async executeFlowStep(
    step: any,
    context: any,
    userId: string,
    chatId: string
  ): Promise<void> {
    try {
      switch (step.type) {
        case 'send_message':
          if (step.message) {
            const resolvedMessage = this.resolveVariables(step.message, context.variables);
            await this.sendBotMessage(userId, chatId, {
              content: resolvedMessage,
              trigger: 'flow_step'
            });
          }
          break;

        case 'run_gemini':
          if (step.prompt) {
            const resolvedPrompt = this.resolveVariables(step.prompt, context.variables);
            const agentConfig = await this.agentService.getAgentConfigForAI(userId);
            
            const aiResponse = await this.aiService.generateConversationResponse(
              userId,
              chatId,
              resolvedPrompt,
              agentConfig,
              { maxTokens: 1000 }
            );

            if (aiResponse.success && aiResponse.content) {
              if (step.outputVariable) {
                context.variables[step.outputVariable] = aiResponse.content;
              } else {
                await this.sendBotMessage(userId, chatId, {
                  content: aiResponse.content,
                  trigger: 'flow_gemini'
                });
              }
            }
          }
          break;

        case 'delay':
          if (step.delayMs && step.delayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, Math.min(step.delayMs, 30000)));
          }
          break;
      }
    } catch (error) {
      this.logger.error('Error executing flow step', {
        stepType: step.type,
        userId,
        chatId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Send bot message with AI generation
   */
  public async sendBotMessage(
    userId: string,
    chatId: string,
    options: {
      content?: string;
      trigger?: string;
      context?: ConversationContext;
      template?: string;
      variables?: Record<string, string>;
    }
  ): Promise<MessageProcessingResult> {
    try {
      this.logger.info('Sending bot message', {
        userId,
        chatId,
        trigger: options.trigger,
        hasContent: !!options.content
      });

      let messageContent = options.content || options.template || '';

      // Replace variables in template
      if (options.variables && messageContent) {
        for (const [key, value] of Object.entries(options.variables)) {
          messageContent = messageContent.replace(new RegExp(`{{${key}}}`, 'g'), value);
        }
      }

      if (!messageContent) {
        return {
          success: false,
          error: 'No message content generated'
        };
      }

      // Add natural delay
      const delay = Math.random() * 2000 + 1000; // 1-3 seconds
      await new Promise(resolve => setTimeout(resolve, delay));

      // Send through worker
      const success = await this.workerManager.sendMessage(userId, chatId, messageContent);
      
      if (!success) {
        return {
          success: false,
          error: 'Failed to send through worker'
        };
      }

      // Save bot message to Firestore
      const messageId = await this.saveBotMessage(userId, chatId, messageContent, options.trigger || 'auto');

      // Update chat metadata
      await this.updateChatAfterBotMessage(userId, chatId, messageContent);

      this.emit('botMessageSent', {
        userId,
        chatId,
        messageId,
        content: messageContent,
        trigger: options.trigger
      });

      return {
        success: true,
        messageId,
        metadata: {
          content: messageContent,
          trigger: options.trigger
        }
      };

    } catch (error) {
      this.logger.error('Error sending bot message', {
        userId,
        chatId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Send media message
   */
  public async sendMedia(
    userId: string,
    chatId: string,
    mediaData: {
      url: string;
      type: 'image' | 'video' | 'audio' | 'document';
      caption?: string;
      filename?: string;
    }
  ): Promise<MessageProcessingResult> {
    try {
      this.logger.info('Sending media message', {
        userId,
        chatId,
        mediaType: mediaData.type,
        hasCaption: !!mediaData.caption
      });

      // Create media job
      const job: MessageJob = {
        id: this.generateJobId(),
        userId,
        chatId,
        type: 'send_media',
        payload: mediaData,
        priority: 'normal',
        attempts: 0,
        maxAttempts: 2,
        createdAt: new Date()
      };

      return await this.processMediaJob(job);

    } catch (error) {
      this.logger.error('Error sending media', {
        userId,
        chatId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get message queue status for user
   */
  public getQueueStatus(userId: string): {
    pending: number;
    processing: number;
    failed: number;
  } {
    const userQueue = this.messageQueue.get(userId) || [];
    const processing = Array.from(this.processingJobs).filter(id => id.startsWith(userId)).length;
    
    return {
      pending: userQueue.length,
      processing,
      failed: 0 // Would track failed jobs in production
    };
  }

  /**
   * Clear message queue for user
   */
  public clearQueue(userId: string): void {
    this.messageQueue.delete(userId);
    this.logger.info('Message queue cleared', { userId });
  }

  /**
   * Process message job
   */
  private async processMessageJob(job: MessageJob): Promise<MessageProcessingResult> {
    try {
      this.processingJobs.add(job.id);
      job.attempts++;

      const { userId, chatId, payload } = job;
      const { message, origin, type } = payload;

      // Send through worker
      const success = await this.workerManager.sendMessage(userId, chatId, message);

      if (!success) {
        throw new Error('Worker send failed');
      }

      // Save message to Firestore
      const messageId = await this.saveOutgoingMessage(userId, chatId, {
        content: message,
        origin,
        type
      });

      // Update chat metadata
      await this.updateChatAfterOutgoingMessage(userId, chatId, message, origin);

      this.processingJobs.delete(job.id);

      return {
        success: true,
        messageId,
        metadata: {
          attempts: job.attempts
        }
      };

    } catch (error) {
      this.processingJobs.delete(job.id);

      // Retry if attempts remaining
      if (job.attempts < job.maxAttempts) {
        job.scheduledAt = new Date(Date.now() + (job.attempts * 2000)); // Exponential backoff
        await this.queueJob(job);
        
        return {
          success: false,
          error: `Failed, queued for retry (attempt ${job.attempts}/${job.maxAttempts})`
        };
      }

      this.logger.error('Message job failed permanently', {
        jobId: job.id,
        userId: job.userId,
        chatId: job.chatId,
        attempts: job.attempts,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Process media job
   */
  private async processMediaJob(job: MessageJob): Promise<MessageProcessingResult> {
    try {
      this.processingJobs.add(job.id);
      job.attempts++;

      const { userId, chatId, payload } = job;
      
      // This would integrate with WhatsApp service for media sending
      // For now, we'll simulate the process
      
      const messageId = await this.saveMediaMessage(userId, chatId, payload);

      this.processingJobs.delete(job.id);

      return {
        success: true,
        messageId,
        metadata: {
          mediaType: payload.type,
          attempts: job.attempts
        }
      };

    } catch (error) {
      this.processingJobs.delete(job.id);

      if (job.attempts < job.maxAttempts) {
        job.scheduledAt = new Date(Date.now() + (job.attempts * 3000));
        await this.queueJob(job);
        
        return {
          success: false,
          error: `Media send failed, queued for retry (attempt ${job.attempts}/${job.maxAttempts})`
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Queue a job for processing
   */
  private async queueJob(job: MessageJob): Promise<void> {
    const userQueue = this.messageQueue.get(job.userId) || [];
    userQueue.push(job);
    
    // Sort by priority and scheduled time
    userQueue.sort((a, b) => {
      const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
      const aPriority = priorityOrder[a.priority];
      const bPriority = priorityOrder[b.priority];
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      const aTime = a.scheduledAt?.getTime() || a.createdAt.getTime();
      const bTime = b.scheduledAt?.getTime() || b.createdAt.getTime();
      
      return aTime - bTime;
    });
    
    this.messageQueue.set(job.userId, userQueue);
    
    this.logger.debug('Job queued', {
      jobId: job.id,
      userId: job.userId,
      type: job.type,
      priority: job.priority,
      queueSize: userQueue.length
    });
  }

  /**
   * Start message processing loop
   */
  private startMessageProcessing(): void {
    setInterval(async () => {
      for (const [userId, jobs] of this.messageQueue.entries()) {
        if (jobs.length === 0) continue;

        const now = Date.now();
        const readyJobs = jobs.filter(job => {
          const scheduledTime = job.scheduledAt?.getTime() || job.createdAt.getTime();
          return scheduledTime <= now && !this.processingJobs.has(job.id);
        });

        if (readyJobs.length > 0) {
          const job = readyJobs[0];
          
          // Remove from queue
          const jobIndex = jobs.indexOf(job);
          jobs.splice(jobIndex, 1);
          
          // Process job
          switch (job.type) {
            case 'send_message':
              this.processMessageJob(job);
              break;
            case 'send_bot_message':
              this.processBotMessageJob(job);
              break;
            case 'send_media':
              this.processMediaJob(job);
              break;
            case 'auto_reply':
              this.processAutoReplyJob(job);
              break;
          }
        }
      }
    }, 1000); // Check every second
  }

  /**
   * Process bot message job
   */
  private async processBotMessageJob(job: MessageJob): Promise<void> {
    try {
      const { userId, chatId, payload } = job;
      
      // Get conversation context
      const context = await this.buildConversationContext(userId, chatId);
      
      await this.sendBotMessage(userId, chatId, {
        trigger: payload.trigger,
        context
      });
      
    } catch (error) {
      this.logger.error('Error processing bot message job', {
        jobId: job.id,
        userId: job.userId,
        chatId: job.chatId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Process auto-reply job
   */
  private async processAutoReplyJob(job: MessageJob): Promise<void> {
    try {
      const { userId, chatId, payload } = job;
      
      await this.processAutoReply(
        userId,
        chatId,
        payload.incomingMessage,
        payload.context
      );
      
    } catch (error) {
      this.logger.error('Error processing auto-reply job', {
        jobId: job.id,
        userId: job.userId,
        chatId: job.chatId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Check rate limit for user
   */
  private checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const limit = this.rateLimits.get(userId);
    
    if (!limit || now > limit.resetTime) {
      this.rateLimits.set(userId, {
        count: 1,
        resetTime: now + this.RATE_LIMIT_WINDOW
      });
      return true;
    }
    
    if (limit.count >= this.DEFAULT_RATE_LIMIT) {
      return false;
    }
    
    limit.count++;
    return true;
  }

  /**
   * MIGRADO DE: whatsapp-api/src/worker.js líneas 955-1050
   * Check if auto-reply should be triggered
   */
  private async shouldTriggerAutoReply(
    userId: string,
    chatId: string,
    messageData: any
  ): Promise<boolean> {
    try {
      // Check if chat is activated
      const chatDoc = await this.db
        .collection('users')
        .doc(userId)
        .collection('chats')
        .doc(chatId)
        .get();

      if (!chatDoc.exists || !chatDoc.data()?.isActivated) {
        return false;
      }

      // Check user activity status
      const chatData = chatDoc.data()!;
      const userIsActive = chatData.userIsActive || false;
      const lastActivityTime = chatData.lastActivityTimestamp?.toDate?.()?.getTime() || 0;
      const inactivityDuration = Date.now() - lastActivityTime;

      // Don't auto-reply if user is active and was active recently
      if (userIsActive && inactivityDuration < this.INACTIVITY_THRESHOLD) {
        this.logger.debug('User is active, skipping auto-reply', {
          userId,
          chatId,
          inactivityDuration: Math.round(inactivityDuration / 1000 / 60) // minutes
        });
        return false;
      }

      // Check bot pause state
      const statusDoc = await this.db
        .collection('users')
        .doc(userId)
        .collection('status')
        .doc('whatsapp')
        .get();

      if (statusDoc.exists && statusDoc.data()?.botIsPaused === true) {
        this.logger.debug('Bot is paused, skipping auto-reply', { userId, chatId });
        return false;
      }

      return true;

    } catch (error) {
      this.logger.error('Error checking auto-reply conditions', {
        userId,
        chatId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Save incoming message to Firestore
   */
  private async saveIncomingMessage(
    userId: string,
    chatId: string,
    messageData: any
  ): Promise<string> {
    const chatDocRef = this.db
      .collection('users')
      .doc(userId)
      .collection('chats')
      .doc(chatId);

    const timestamp = new Date().toISOString();
    const messagePayload = {
      body: messageData.body || '',
      timestamp,
      isFromMe: false,
      messageId: messageData.id?.id || '',
      from: chatId,
      to: `me (${userId})`,
      origin: 'contact' as MessageOrigin,
      type: messageData.type || 'text' as MessageType,
      hasMedia: messageData.hasMedia || false,
      ack: messageData.ack || 0,
      status: 'received',
      createdAt: timestamp,
      updatedAt: timestamp
    };

    // Save to both contact and all collections
    const [contactDoc, allDoc] = await Promise.all([
      chatDocRef.collection('messages_contact').add(messagePayload),
      chatDocRef.collection('messages_all').add(messagePayload)
    ]);

    return allDoc.id;
  }

  /**
   * Save outgoing message to Firestore
   */
  private async saveOutgoingMessage(
    userId: string,
    chatId: string,
    messageData: { content: string; origin: MessageOrigin; type: MessageType }
  ): Promise<string> {
    const chatDocRef = this.db
      .collection('users')
      .doc(userId)
      .collection('chats')
      .doc(chatId);

    const timestamp = new Date().toISOString();
    const messagePayload = {
      body: messageData.content,
      timestamp,
      isFromMe: true,
      from: `me (${userId})`,
      to: chatId,
      origin: messageData.origin,
      type: messageData.type,
      isAutoReply: messageData.origin === 'bot',
      hasMedia: false,
      status: 'sent',
      createdAt: timestamp,
      updatedAt: timestamp
    };

    // Save to appropriate collections
    const savePromises = [
      chatDocRef.collection('messages_all').add(messagePayload)
    ];

    if (messageData.origin === 'human') {
      savePromises.push(
        chatDocRef.collection('messages_human').add(messagePayload)
      );
    } else if (messageData.origin === 'bot') {
      savePromises.push(
        chatDocRef.collection('messages_bot').add(messagePayload)
      );
    }

    const results = await Promise.all(savePromises);
    return results[0].id;
  }

  /**
   * Save bot message to Firestore
   */
  private async saveBotMessage(
    userId: string,
    chatId: string,
    content: string,
    trigger: string
  ): Promise<string> {
    return this.saveOutgoingMessage(userId, chatId, {
      content,
      origin: 'bot',
      type: 'text'
    });
  }

  /**
   * Save media message to Firestore
   */
  private async saveMediaMessage(
    userId: string,
    chatId: string,
    mediaData: any
  ): Promise<string> {
    const chatDocRef = this.db
      .collection('users')
      .doc(userId)
      .collection('chats')
      .doc(chatId);

    const timestamp = new Date().toISOString();
    const messagePayload = {
      body: mediaData.caption || '',
      timestamp,
      isFromMe: true,
      from: `me (${userId})`,
      to: chatId,
      origin: 'human' as MessageOrigin,
      type: mediaData.type as MessageType,
      hasMedia: true,
      mediaUrl: mediaData.url,
      mediaType: mediaData.type,
      status: 'sent',
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const results = await Promise.all([
      chatDocRef.collection('messages_all').add(messagePayload),
      chatDocRef.collection('messages_human').add(messagePayload)
    ]);

    return results[0].id;
  }

  /**
   * Update chat after incoming message
   */
  private async updateChatAfterIncomingMessage(
    userId: string,
    chatId: string,
    messageData: any
  ): Promise<void> {
    const chatDocRef = this.db
      .collection('users')
      .doc(userId)
      .collection('chats')
      .doc(chatId);

    const timestamp = new Date().toISOString();
    await chatDocRef.set({
      lastContactMessageTimestamp: timestamp,
      lastMessageTimestamp: timestamp,
      lastMessageContent: messageData.body || '',
      lastMessageOrigin: 'contact',
      lastActivityTimestamp: timestamp,
      updatedAt: timestamp
    }, { merge: true });
  }

  /**
   * Update chat after outgoing message
   */
  private async updateChatAfterOutgoingMessage(
    userId: string,
    chatId: string,
    content: string,
    origin: MessageOrigin
  ): Promise<void> {
    const chatDocRef = this.db
      .collection('users')
      .doc(userId)
      .collection('chats')
      .doc(chatId);

    const timestamp = new Date().toISOString();
    const updateData: any = {
      lastMessageContent: content,
      lastMessageTimestamp: timestamp,
      lastMessageOrigin: origin,
      lastActivityTimestamp: timestamp,
      updatedAt: timestamp
    };

    if (origin === 'human') {
      updateData.lastHumanMessageTimestamp = timestamp;
      updateData.userIsActive = true;
    } else if (origin === 'bot') {
      updateData.lastBotMessageTimestamp = timestamp;
    }

    await chatDocRef.set(updateData, { merge: true });
  }

  /**
   * Update chat after bot message
   */
  private async updateChatAfterBotMessage(
    userId: string,
    chatId: string,
    content: string
  ): Promise<void> {
    return this.updateChatAfterOutgoingMessage(userId, chatId, content, 'bot');
  }

  /**
   * Generate AI response (placeholder for AI integration)
   */
  private async generateAIResponse(
    userId: string,
    chatId: string,
    context: ConversationContext
  ): Promise<string> {
    // This would integrate with your AI service (Gemini, OpenAI, etc.)
    // For now, return a placeholder
    return "Thank you for your message. I'll get back to you soon!";
  }

  /**
   * Build conversation context
   */
  private async buildConversationContext(
    userId: string,
    chatId: string
  ): Promise<ConversationContext> {
    // This would use the MessageController's buildConversationContext method
    // For now, return empty context
    return {
      chatId,
      messages: [],
      totalTokens: 0,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Transform message for client
   */
  private transformMessageForClient(messageData: any, messageId: string): any {
    return {
      id: messageId,
      chatId: messageData.from,
      body: messageData.body || '',
      from: messageData.from,
      to: messageData.to,
      fromMe: false,
      timestamp: new Date().toISOString(),
      type: messageData.type || 'text',
      origin: 'contact',
      hasMedia: messageData.hasMedia || false
    };
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Listen for worker events
    this.workerManager.on('statusChanged', (data) => {
      if (data.status === 'connected') {
        this.logger.info('Worker connected, resuming message processing', {
          userId: data.userId
        });
      }
    });

    // Cleanup on shutdown
    process.on('SIGINT', () => {
      this.logger.info('Shutting down message broker...');
      this.messageQueue.clear();
      this.processingJobs.clear();
    });
  }

  /**
   * Get user configuration (rules, starters, flows, triggers) with caching
   */
  private async getUserConfiguration(userId: string): Promise<{
    rules: AutoReplyRule[];
    starters: GeminiStarter[];
    flows: ActionFlow[];
    initialTriggers: InitialTrigger[];
  }> {
    const cached = this.userConfigCache.get(userId);
    const now = new Date();

    if (cached && (now.getTime() - cached.lastUpdated.getTime()) < this.CONFIG_CACHE_TTL) {
      return cached;
    }

    try {
      const userDocRef = this.db.collection('users').doc(userId);

      const [rulesSnapshot, startersSnapshot, flowsSnapshot, triggersSnapshot] = await Promise.all([
        userDocRef.collection('rules').where('isActive', '==', true).get(),
        userDocRef.collection('gemini_starters').where('isActive', '==', true).get(),
        userDocRef.collection('action_flows').where('isActive', '==', true).get(),
        this.getInitialTriggersSnapshot(userId)
      ]);

      const config = {
        rules: rulesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as AutoReplyRule),
        starters: startersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as GeminiStarter),
        flows: flowsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as ActionFlow),
        initialTriggers: triggersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as InitialTrigger),
        lastUpdated: now
      };

      this.userConfigCache.set(userId, config);

      this.logger.debug('User configuration loaded', {
        userId,
        rulesCount: config.rules.length,
        startersCount: config.starters.length,
        flowsCount: config.flows.length,
        triggersCount: config.initialTriggers.length
      });

      return config;

    } catch (error) {
      this.logger.error('Error loading user configuration', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        rules: [],
        starters: [],
        flows: [],
        initialTriggers: []
      };
    }
  }

  /**
   * Get initial triggers for user
   */
  private async getInitialTriggers(userId: string): Promise<InitialTrigger[]> {
    try {
      const config = await this.getUserConfiguration(userId);
      return config.initialTriggers;
    } catch (error) {
      this.logger.error('Error getting initial triggers', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  /**
   * Get initial triggers snapshot
   */
  private async getInitialTriggersSnapshot(userId: string) {
    try {
      // Get current active agent
      const activeAgent = await this.agentService.getActiveAgent(userId);
      const agentId = activeAgent.activeAgentId || 'default';

      return await this.db
        .collection('users')
        .doc(userId)
        .collection('agents')
        .doc(agentId)
        .collection('triggers')
        .where('isActive', '==', true)
        .get();
    } catch (error) {
      // Return empty snapshot if no triggers
      return { docs: [] };
    }
  }

  /**
   * Clear user configuration cache
   */
  public clearUserConfigCache(userId: string): void {
    this.userConfigCache.delete(userId);
    this.logger.debug('User configuration cache cleared', { userId });
  }

  /**
   * Resolve variables in text
   */
  private resolveVariables(text: string, variables: Record<string, any>): string {
    let resolved = text;
    
    for (const [key, value] of Object.entries(variables)) {
      const pattern = new RegExp(`{{${key}}}`, 'g');
      resolved = resolved.replace(pattern, String(value || ''));
    }
    
    return resolved;
  }

  /**
   * Transform message data to Message interface
   */
  private transformToMessage(messageData: any): Message {
    return {
      id: messageData.id?.id || '',
      chatId: messageData.from,
      from: messageData.from,
      to: messageData.to,
      body: messageData.body || '',
      timestamp: new Date().toISOString(),
      type: messageData.type || 'text',
      origin: 'contact',
      status: 'received',
      fromMe: false,
      isAutoReply: false,
      hasMedia: messageData.hasMedia || false,
      hasReacted: false,
      hasSticker: false,
      isEphemeral: false,
      isForwarded: false,
      isGif: false,
      isStarred: false,
      isStatus: false,
      mentionedIds: [],
      vCards: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Get service statistics (updated)
   */
  public getStatistics(): any {
    const totalQueued = Array.from(this.messageQueue.values())
      .reduce((sum, queue) => sum + queue.length, 0);
    
    return {
      totalQueued,
      processing: this.processingJobs.size,
      users: this.messageQueue.size,
      rateLimitedUsers: this.rateLimits.size,
      configCacheSize: this.userConfigCache.size,
      autoReplyCapable: true
    };
  }
} 