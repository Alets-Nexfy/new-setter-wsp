import { LoggerService } from '@/core/services/LoggerService';
import { QueueService } from '@/core/services/QueueService';
import { WhatsAppSessionManager } from '@/platforms/whatsapp/services/WhatsAppSessionManager';
import { WhatsAppMessageHandler } from '@/platforms/whatsapp/services/WhatsAppMessageHandler';
import { AIService } from '@/core/services/AIService';
import { JOB_TYPES } from '@/shared/constants';

export class WhatsAppWorker {
  private logger: LoggerService;
  private queue: QueueService;
  private sessionManager: WhatsAppSessionManager;
  private messageHandler: WhatsAppMessageHandler;
  private aiService: AIService;
  private isRunning: boolean = false;

  constructor() {
    this.logger = LoggerService.getInstance();
    this.queue = QueueService.getInstance();
    this.sessionManager = WhatsAppSessionManager.getInstance();
    this.messageHandler = WhatsAppMessageHandler.getInstance();
    this.aiService = AIService.getInstance();
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('WhatsApp worker is already running');
      return;
    }

    try {
      this.logger.info('Starting WhatsApp worker');

      // Initialize queues
      await this.initializeQueues();

      // Start processing jobs
      this.isRunning = true;

      this.logger.info('WhatsApp worker started successfully');

      // Graceful shutdown handling
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());

    } catch (error) {
      this.logger.error('Failed to start WhatsApp worker', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private async initializeQueues(): Promise<void> {
    // WhatsApp message queue
    this.queue.processJob('whatsapp', async (job) => {
      await this.processWhatsAppJob(job);
    });

    // WhatsApp media queue
    this.queue.processJobWithType('whatsapp', JOB_TYPES.WHATSAPP_SEND_MEDIA, async (job) => {
      await this.processMediaJob(job);
    });

    // WhatsApp webhook queue
    this.queue.processJobWithType('whatsapp', JOB_TYPES.WHATSAPP_PROCESS_WEBHOOK, async (job) => {
      await this.processWebhookJob(job);
    });

    // AI response queue
    this.queue.processJob('ai', async (job) => {
      await this.processAIJob(job);
    });

    // Automation queue
    this.queue.processJob('automation', async (job) => {
      await this.processAutomationJob(job);
    });

    this.logger.info('WhatsApp worker queues initialized');
  }

  private async processWhatsAppJob(job: any): Promise<void> {
    const startTime = Date.now();
    const { sessionId, to, content, type, mediaUrl, caption } = job.data;

    try {
      this.logger.info('Processing WhatsApp job', {
        jobId: job.id,
        sessionId,
        to,
        type: type || 'text',
      });

      const result = await this.messageHandler.sendMessage({
        sessionId,
        to,
        content,
        type,
        mediaUrl,
        caption,
      });

      if (result.success) {
        this.logger.info('WhatsApp job completed successfully', {
          jobId: job.id,
          messageId: result.messageId,
          processingTime: Date.now() - startTime,
        });
      } else {
        throw new Error(result.error || 'Unknown error');
      }

    } catch (error) {
      this.logger.error('WhatsApp job failed', {
        jobId: job.id,
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime,
      });

      // Retry logic
      if (job.attemptsMade < 3) {
        throw error; // This will trigger a retry
      } else {
        this.logger.error('WhatsApp job failed permanently', {
          jobId: job.id,
          attempts: job.attemptsMade,
        });
      }
    }
  }

  private async processMediaJob(job: any): Promise<void> {
    const { sessionId, to, mediaUrl, caption, fileName, mimeType } = job.data;

    try {
      this.logger.info('Processing media job', {
        jobId: job.id,
        sessionId,
        to,
        mediaUrl,
      });

      const result = await this.messageHandler.sendMessage({
        sessionId,
        to,
        content: mediaUrl,
        type: this.determineMediaType(mimeType),
        mediaUrl,
        caption,
        fileName,
        mimeType,
      });

      if (result.success) {
        this.logger.info('Media job completed successfully', {
          jobId: job.id,
          messageId: result.messageId,
        });
      } else {
        throw new Error(result.error || 'Unknown error');
      }

    } catch (error) {
      this.logger.error('Media job failed', {
        jobId: job.id,
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private async processWebhookJob(job: any): Promise<void> {
    const { webhookData, sessionId } = job.data;

    try {
      this.logger.info('Processing webhook job', {
        jobId: job.id,
        sessionId,
        eventType: webhookData.event,
      });

      // Process different webhook events
      switch (webhookData.event) {
        case 'message':
          await this.handleWebhookMessage(webhookData, sessionId);
          break;
        case 'status':
          await this.handleWebhookStatus(webhookData, sessionId);
          break;
        case 'session':
          await this.handleWebhookSession(webhookData, sessionId);
          break;
        default:
          this.logger.warn('Unknown webhook event type', {
            eventType: webhookData.event,
            sessionId,
          });
      }

      this.logger.info('Webhook job completed successfully', {
        jobId: job.id,
        eventType: webhookData.event,
      });

    } catch (error) {
      this.logger.error('Webhook job failed', {
        jobId: job.id,
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private async processAIJob(job: any): Promise<void> {
    const { sessionId, messageId, platform, message } = job.data;

    try {
      this.logger.info('Processing AI job', {
        jobId: job.id,
        sessionId,
        messageId,
        platform,
      });

      // Get conversation context
      const context = await this.buildAIContext(sessionId, message);

      // Generate AI response
      const aiResponse = await this.aiService.generateConversationalResponse(
        message.content,
        context
      );

      // Send response back to the user
      if (aiResponse.content.trim()) {
        await this.queue.addWhatsAppJob(JOB_TYPES.WHATSAPP_SEND_MESSAGE, {
          sessionId,
          to: message.from,
          content: aiResponse.content,
          type: 'text',
        });
      }

      this.logger.info('AI job completed successfully', {
        jobId: job.id,
        responseId: aiResponse.id,
        tokens: aiResponse.tokens,
      });

    } catch (error) {
      this.logger.error('AI job failed', {
        jobId: job.id,
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private async processAutomationJob(job: any): Promise<void> {
    const { automationRule, message, sessionId } = job.data;

    try {
      this.logger.info('Processing automation job', {
        jobId: job.id,
        sessionId,
        ruleId: automationRule.id,
      });

      // Check if automation rule should be triggered
      const shouldTrigger = await this.evaluateAutomationTriggers(
        automationRule.triggers,
        message
      );

      if (shouldTrigger) {
        // Execute automation actions
        await this.executeAutomationActions(
          automationRule.actions,
          message,
          sessionId
        );
      }

      this.logger.info('Automation job completed successfully', {
        jobId: job.id,
        ruleId: automationRule.id,
        triggered: shouldTrigger,
      });

    } catch (error) {
      this.logger.error('Automation job failed', {
        jobId: job.id,
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private determineMediaType(mimeType?: string): 'image' | 'video' | 'audio' | 'document' {
    if (!mimeType) return 'document';

    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'document';
  }

  private async handleWebhookMessage(webhookData: any, sessionId: string): Promise<void> {
    // Process incoming message from webhook
    const message = webhookData.data;
    
    // Save message to database
    await this.messageHandler.saveMessage({
      id: message.id,
      sessionId,
      platform: 'whatsapp',
      from: message.from,
      to: message.to,
      type: message.type,
      content: message.body,
      status: 'received',
      timestamp: new Date(message.timestamp),
      mediaUrl: message.mediaUrl,
      fileName: message.fileName,
      mimeType: message.mimeType,
      caption: message.caption,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Queue for AI processing
    await this.queue.addAIJob(JOB_TYPES.AI_GENERATE_RESPONSE, {
      sessionId,
      messageId: message.id,
      platform: 'whatsapp',
      message: {
        from: message.from,
        content: message.body,
        type: message.type,
      },
    });
  }

  private async handleWebhookStatus(webhookData: any, sessionId: string): Promise<void> {
    const status = webhookData.data;
    
    // Update message status
    await this.messageHandler.updateMessageStatus(status.messageId, status.status);
  }

  private async handleWebhookSession(webhookData: any, sessionId: string): Promise<void> {
    const sessionData = webhookData.data;
    
    // Update session status
    await this.sessionManager.updateSessionStatus(sessionId, sessionData.status);
  }

  private async buildAIContext(sessionId: string, message: any): Promise<any> {
    // Get recent conversation history
    const recentMessages = await this.messageHandler.getMessages(sessionId, {
      limit: 10,
      from: message.from,
    });

    const conversationHistory = recentMessages.map(msg => ({
      role: msg.from === 'me' ? 'assistant' : 'user',
      content: msg.content,
      timestamp: msg.timestamp,
    }));

    return {
      sessionId,
      userId: 'system', // Will be updated with actual user ID
      platform: 'whatsapp',
      conversationHistory,
    };
  }

  private async evaluateAutomationTriggers(triggers: any[], message: any): Promise<boolean> {
    for (const trigger of triggers) {
      switch (trigger.type) {
        case 'keyword':
          if (message.content.toLowerCase().includes(trigger.value.toLowerCase())) {
            return true;
          }
          break;
        case 'regex':
          const regex = new RegExp(trigger.value, 'i');
          if (regex.test(message.content)) {
            return true;
          }
          break;
        // Add more trigger types as needed
      }
    }
    return false;
  }

  private async executeAutomationActions(actions: any[], message: any, sessionId: string): Promise<void> {
    for (const action of actions) {
      switch (action.type) {
        case 'send_message':
          await this.queue.addWhatsAppJob(JOB_TYPES.WHATSAPP_SEND_MESSAGE, {
            sessionId,
            to: message.from,
            content: action.value,
            type: 'text',
          });
          break;
        case 'ai_response':
          await this.queue.addAIJob(JOB_TYPES.AI_GENERATE_RESPONSE, {
            sessionId,
            messageId: message.id,
            platform: 'whatsapp',
            message: {
              from: message.from,
              content: message.content,
              type: message.type,
            },
          });
          break;
        case 'delay':
          await new Promise(resolve => setTimeout(resolve, parseInt(action.value) || 1000));
          break;
        // Add more action types as needed
      }
    }
  }

  public async shutdown(): Promise<void> {
    if (!this.isRunning) return;

    this.logger.info('Shutting down WhatsApp worker');

    try {
      // Cleanup sessions
      await this.sessionManager.cleanupAll();

      // Close queues
      await this.queue.close();

      this.isRunning = false;
      this.logger.info('WhatsApp worker shutdown completed');

    } catch (error) {
      this.logger.error('Error during WhatsApp worker shutdown', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  public getStatus(): { isRunning: boolean } {
    return { isRunning: this.isRunning };
  }
}

// Start the worker if this file is run directly
if (require.main === module) {
  const worker = new WhatsAppWorker();
  
  worker.start().catch((error) => {
    console.error('Failed to start WhatsApp worker:', error);
    process.exit(1);
  });
}

export { WhatsAppWorker }; 