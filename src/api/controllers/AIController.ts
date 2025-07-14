import { Request, Response } from 'express';
import { LoggerService } from '@/core/services/LoggerService';
import { AIService } from '@/core/services/AIService';
import { QueueService } from '@/core/services/QueueService';
import { JOB_TYPES } from '@/shared/constants';

export class AIController {
  private logger: LoggerService;
  private aiService: AIService;
  private queue: QueueService;

  constructor() {
    this.logger = LoggerService.getInstance();
    this.aiService = AIService.getInstance();
    this.queue = QueueService.getInstance();
  }

  // POST /api/v2/ai/generate-response
  public async generateResponse(req: Request, res: Response): Promise<void> {
    try {
      const { prompt, context, options } = req.body;

      if (!prompt) {
        res.status(400).json({
          success: false,
          error: 'Prompt is required',
        });
        return;
      }

      const aiContext = {
        sessionId: context?.sessionId || 'default',
        userId: context?.userId || 'system',
        platform: context?.platform || 'whatsapp',
        conversationHistory: context?.conversationHistory || [],
        userPreferences: context?.userPreferences || {},
        businessContext: context?.businessContext || {},
      };

      const aiOptions = {
        maxTokens: options?.maxTokens || 500,
        temperature: options?.temperature || 0.7,
        topP: options?.topP || 0.9,
        topK: options?.topK || 40,
        stopSequences: options?.stopSequences || [],
      };

      const response = await this.aiService.generateResponse({
        prompt,
        context: aiContext,
        ...aiOptions,
      });

      res.json({
        success: true,
        data: response,
      });

    } catch (error) {
      this.logger.error('Error generating AI response', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to generate response',
      });
    }
  }

  // POST /api/v2/ai/analyze-sentiment
  public async analyzeSentiment(req: Request, res: Response): Promise<void> {
    try {
      const { message } = req.body;

      if (!message) {
        res.status(400).json({
          success: false,
          error: 'Message is required',
        });
        return;
      }

      const analysis = await this.aiService.analyzeSentiment(message);

      res.json({
        success: true,
        data: analysis,
      });

    } catch (error) {
      this.logger.error('Error analyzing sentiment', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to analyze sentiment',
      });
    }
  }

  // POST /api/v2/ai/summarize
  public async summarizeConversation(req: Request, res: Response): Promise<void> {
    try {
      const { messages } = req.body;

      if (!messages || !Array.isArray(messages)) {
        res.status(400).json({
          success: false,
          error: 'Messages array is required',
        });
        return;
      }

      const summary = await this.aiService.summarizeConversation(messages);

      res.json({
        success: true,
        data: summary,
      });

    } catch (error) {
      this.logger.error('Error summarizing conversation', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to summarize conversation',
      });
    }
  }

  // POST /api/v2/ai/follow-up-questions
  public async generateFollowUpQuestions(req: Request, res: Response): Promise<void> {
    try {
      const { message, context } = req.body;

      if (!message) {
        res.status(400).json({
          success: false,
          error: 'Message is required',
        });
        return;
      }

      const aiContext = {
        sessionId: context?.sessionId || 'default',
        userId: context?.userId || 'system',
        platform: context?.platform || 'whatsapp',
        conversationHistory: context?.conversationHistory || [],
        userPreferences: context?.userPreferences || {},
        businessContext: context?.businessContext || {},
      };

      const questions = await this.aiService.generateFollowUpQuestions(message, aiContext);

      res.json({
        success: true,
        data: {
          questions,
          count: questions.length,
        },
      });

    } catch (error) {
      this.logger.error('Error generating follow-up questions', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to generate follow-up questions',
      });
    }
  }

  // POST /api/v2/ai/auto-reply
  public async generateAutoReply(req: Request, res: Response): Promise<void> {
    try {
      const { message, context } = req.body;

      if (!message) {
        res.status(400).json({
          success: false,
          error: 'Message is required',
        });
        return;
      }

      const aiContext = {
        sessionId: context?.sessionId || 'default',
        userId: context?.userId || 'system',
        platform: context?.platform || 'whatsapp',
        conversationHistory: context?.conversationHistory || [],
        userPreferences: context?.userPreferences || {},
        businessContext: context?.businessContext || {},
      };

      const autoReply = await this.aiService.generateAutoReply(message, aiContext);

      res.json({
        success: true,
        data: autoReply,
      });

    } catch (error) {
      this.logger.error('Error generating auto-reply', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to generate auto-reply',
      });
    }
  }

  // POST /api/v2/ai/queue-response
  public async queueAIResponse(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId, messageId, platform, message } = req.body;

      if (!sessionId || !messageId || !platform || !message) {
        res.status(400).json({
          success: false,
          error: 'Session ID, message ID, platform, and message are required',
        });
        return;
      }

      // Queue AI response generation
      await this.queue.addAIJob(JOB_TYPES.AI_GENERATE_RESPONSE, {
        sessionId,
        messageId,
        platform,
        message,
      });

      res.json({
        success: true,
        data: {
          message: 'AI response queued for processing',
          jobType: JOB_TYPES.AI_GENERATE_RESPONSE,
        },
      });

    } catch (error) {
      this.logger.error('Error queuing AI response', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to queue AI response',
      });
    }
  }

  // GET /api/v2/ai/health
  public async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      const isHealthy = await this.aiService.healthCheck();

      if (isHealthy) {
        res.json({
          success: true,
          data: {
            status: 'healthy',
            service: 'AI',
            timestamp: new Date().toISOString(),
          },
        });
      } else {
        res.status(503).json({
          success: false,
          error: 'AI service is unhealthy',
        });
      }

    } catch (error) {
      this.logger.error('Error checking AI health', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(503).json({
        success: false,
        error: 'AI service health check failed',
      });
    }
  }
} 