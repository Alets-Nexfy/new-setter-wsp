import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { LoggerService } from '@/core/services/LoggerService';

export class ValidationMiddleware {
  private static logger = LoggerService.getInstance();

  // Generic validation middleware
  public static validate(schema: z.ZodSchema) {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        const data = {
          body: req.body,
          query: req.query,
          params: req.params,
        };

        schema.parse(data);
        next();

      } catch (error) {
        if (error instanceof z.ZodError) {
          const errors = error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code,
          }));

          this.logger.warn('Validation failed', {
            path: req.path,
            method: req.method,
            errors,
          });

          res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors,
          });
        } else {
          this.logger.error('Validation error', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });

          res.status(500).json({
            success: false,
            error: 'Internal validation error',
          });
        }
      }
    };
  }

  // WhatsApp-specific validation schemas
  public static whatsappSchemas = {
    // Connect session
    connect: z.object({
      body: z.object({
        userId: z.string().min(1, 'User ID is required'),
        metadata: z.object({
          deviceInfo: z.object({
            platform: z.string().optional(),
            browser: z.string().optional(),
            version: z.string().optional(),
          }).optional(),
          connectionInfo: z.object({
            ip: z.string().optional(),
            userAgent: z.string().optional(),
            location: z.string().optional(),
          }).optional(),
          settings: z.object({
            autoReply: z.boolean().optional(),
            aiEnabled: z.boolean().optional(),
            webhooksEnabled: z.boolean().optional(),
          }).optional(),
        }).optional(),
      }),
      params: z.object({
        sessionId: z.string().min(1, 'Session ID is required'),
      }),
    }),

    // Send message
    sendMessage: z.object({
      body: z.object({
        to: z.string().min(1, 'Recipient is required'),
        message: z.string().min(1, 'Message is required'),
        type: z.enum(['text', 'image', 'video', 'audio', 'document', 'location', 'contact']).optional(),
      }),
      params: z.object({
        sessionId: z.string().min(1, 'Session ID is required'),
      }),
    }),

    // Send media
    sendMedia: z.object({
      body: z.object({
        to: z.string().min(1, 'Recipient is required'),
        mediaUrl: z.string().url('Valid media URL is required'),
        caption: z.string().optional(),
        fileName: z.string().optional(),
        mimeType: z.string().optional(),
      }),
      params: z.object({
        sessionId: z.string().min(1, 'Session ID is required'),
      }),
    }),

    // Send bulk messages
    sendBulk: z.object({
      body: z.object({
        messages: z.array(z.object({
          to: z.string().min(1, 'Recipient is required'),
          content: z.string().min(1, 'Message content is required'),
          type: z.enum(['text', 'image', 'video', 'audio', 'document', 'location', 'contact']).optional(),
          mediaUrl: z.string().url().optional(),
          caption: z.string().optional(),
        })).min(1, 'At least one message is required').max(100, 'Maximum 100 messages allowed'),
      }),
      params: z.object({
        sessionId: z.string().min(1, 'Session ID is required'),
      }),
    }),

    // Get messages
    getMessages: z.object({
      query: z.object({
        limit: z.string().transform(val => parseInt(val)).pipe(z.number().min(1).max(100)).optional(),
        offset: z.string().transform(val => parseInt(val)).pipe(z.number().min(0)).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        type: z.enum(['text', 'image', 'video', 'audio', 'document', 'location', 'contact']).optional(),
        status: z.enum(['pending', 'sent', 'delivered', 'read', 'failed']).optional(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
      }),
      params: z.object({
        sessionId: z.string().min(1, 'Session ID is required'),
      }),
    }),

    // Get sessions
    getSessions: z.object({
      query: z.object({
        userId: z.string().min(1, 'User ID is required'),
      }),
    }),

    // Webhook
    webhook: z.object({
      body: z.object({
        event: z.string().min(1, 'Event type is required'),
        data: z.any().optional(),
        timestamp: z.string().datetime().optional(),
        signature: z.string().optional(),
      }),
      params: z.object({
        sessionId: z.string().min(1, 'Session ID is required'),
      }),
    }),
  };

  // AI-specific validation schemas
  public static aiSchemas = {
    // Generate response
    generateResponse: z.object({
      body: z.object({
        prompt: z.string().min(1, 'Prompt is required'),
        context: z.object({
          sessionId: z.string().optional(),
          userId: z.string().optional(),
          platform: z.enum(['whatsapp', 'instagram']).optional(),
          conversationHistory: z.array(z.object({
            role: z.enum(['user', 'assistant']),
            content: z.string(),
            timestamp: z.string().datetime(),
          })).optional(),
          userPreferences: z.object({
            language: z.string().optional(),
            tone: z.enum(['formal', 'casual', 'friendly', 'professional']).optional(),
            responseLength: z.enum(['short', 'medium', 'long']).optional(),
          }).optional(),
          businessContext: z.object({
            companyName: z.string().optional(),
            industry: z.string().optional(),
            services: z.array(z.string()).optional(),
            targetAudience: z.string().optional(),
          }).optional(),
        }).optional(),
        options: z.object({
          maxTokens: z.number().min(1).max(4000).optional(),
          temperature: z.number().min(0).max(2).optional(),
          topP: z.number().min(0).max(1).optional(),
          topK: z.number().min(1).max(100).optional(),
          stopSequences: z.array(z.string()).optional(),
        }).optional(),
      }),
    }),

    // Analyze sentiment
    analyzeSentiment: z.object({
      body: z.object({
        message: z.string().min(1, 'Message is required'),
      }),
    }),

    // Summarize conversation
    summarize: z.object({
      body: z.object({
        messages: z.array(z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string(),
          timestamp: z.string().datetime(),
        })).min(1, 'At least one message is required'),
      }),
    }),

    // Generate follow-up questions
    followUpQuestions: z.object({
      body: z.object({
        message: z.string().min(1, 'Message is required'),
        context: z.object({
          sessionId: z.string().optional(),
          userId: z.string().optional(),
          platform: z.enum(['whatsapp', 'instagram']).optional(),
          conversationHistory: z.array(z.object({
            role: z.enum(['user', 'assistant']),
            content: z.string(),
            timestamp: z.string().datetime(),
          })).optional(),
          userPreferences: z.object({
            language: z.string().optional(),
            tone: z.enum(['formal', 'casual', 'friendly', 'professional']).optional(),
            responseLength: z.enum(['short', 'medium', 'long']).optional(),
          }).optional(),
          businessContext: z.object({
            companyName: z.string().optional(),
            industry: z.string().optional(),
            services: z.array(z.string()).optional(),
            targetAudience: z.string().optional(),
          }).optional(),
        }).optional(),
      }),
    }),

    // Queue AI response
    queueResponse: z.object({
      body: z.object({
        sessionId: z.string().min(1, 'Session ID is required'),
        messageId: z.string().min(1, 'Message ID is required'),
        platform: z.enum(['whatsapp', 'instagram']),
        message: z.object({
          from: z.string(),
          content: z.string(),
          type: z.enum(['text', 'image', 'video', 'audio', 'document', 'location', 'contact']).optional(),
        }),
      }),
    }),
  };

  // General validation schemas
  public static generalSchemas = {
    // Broadcast message
    broadcast: z.object({
      body: z.object({
        platform: z.enum(['whatsapp', 'instagram']),
        message: z.string().min(1, 'Message is required'),
        recipients: z.array(z.string()).min(1, 'At least one recipient is required'),
        options: z.object({
          delay: z.number().min(0).optional(),
          priority: z.number().min(1).max(10).optional(),
        }).optional(),
      }),
    }),

    // Cleanup
    cleanup: z.object({
      body: z.object({
        type: z.enum(['sessions', 'messages', 'cache', 'queues']),
        options: z.object({
          retentionDays: z.number().min(1).max(365).optional(),
          force: z.boolean().optional(),
        }).optional(),
      }),
    }),

    // Webhook
    webhook: z.object({
      body: z.object({
        platform: z.enum(['whatsapp', 'instagram']),
        event: z.string().min(1, 'Event type is required'),
        data: z.any(),
        sessionId: z.string().optional(),
        timestamp: z.string().datetime().optional(),
        signature: z.string().optional(),
      }),
    }),
  };

  // Sanitize input data
  public static sanitize = (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Sanitize body
      if (req.body) {
        req.body = this.sanitizeObject(req.body);
      }

      // Sanitize query
      if (req.query) {
        req.query = this.sanitizeObject(req.query);
      }

      // Sanitize params
      if (req.params) {
        req.params = this.sanitizeObject(req.params);
      }

      next();

    } catch (error) {
      this.logger.error('Sanitization error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Input sanitization failed',
      });
    }
  };

  private static sanitizeObject(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        // Remove potential XSS and injection attempts
        sanitized[key] = value
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '')
          .trim();
      } else {
        sanitized[key] = this.sanitizeObject(value);
      }
    }

    return sanitized;
  }

  // Validate phone number format
  public static validatePhoneNumber = (phoneNumber: string): boolean => {
    // Basic international phone number validation
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phoneNumber.replace(/\s/g, ''));
  };

  // Validate email format
  public static validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Validate URL format
  public static validateURL = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };
} 