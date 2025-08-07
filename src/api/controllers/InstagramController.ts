import { Request, Response } from 'express';
import { InstagramService } from '../../platforms/instagram/services/InstagramService';
import { InstagramSessionManager } from '../../platforms/instagram/services/InstagramSessionManager';
import { InstagramMessageHandler } from '../../platforms/instagram/services/InstagramMessageHandler';
import { 
  InstagramLoginCredentials, 
  InstagramSessionConfig,
  InstagramApiResponse 
} from '../../shared/types/instagram';
import { INSTAGRAM_CONSTANTS } from '../../shared/constants/instagram';

export class InstagramController {
  constructor(
    private readonly instagramService: InstagramService,
    private readonly sessionManager: InstagramSessionManager,
    private readonly messageHandler: InstagramMessageHandler
  ) {}

  /**
   * Login to Instagram
   * POST /api/instagram/login
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { username, password, twoFactorCode, config } = req.body;

      if (!username || !password) {
        res.status(400).json({
          success: false,
          error: 'Username and password are required',
          timestamp: new Date(),
        });
        return;
      }

      const credentials: InstagramLoginCredentials = {
        username,
        password,
        twoFactorCode,
      };

      const sessionConfig: InstagramSessionConfig = config || {};

      const result = await this.instagramService.login(credentials, sessionConfig);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(401).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Login failed',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Logout from Instagram
   * POST /api/instagram/logout
   */
  async logout(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'Session ID is required',
          timestamp: new Date(),
        });
        return;
      }

      const result = await this.instagramService.logout();

      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Logout failed',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Get session status
   * GET /api/instagram/session/:sessionId
   */
  async getSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'Session ID is required',
          timestamp: new Date(),
        });
        return;
      }

      const session = await this.sessionManager.getSession(sessionId);

      if (session) {
        res.status(200).json({
          success: true,
          data: session,
          timestamp: new Date(),
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Session not found',
          timestamp: new Date(),
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get session',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Get user sessions
   * GET /api/instagram/sessions/:userId
   */
  async getUserSessions(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'User ID is required',
          timestamp: new Date(),
        });
        return;
      }

      const sessions = await this.sessionManager.getUserSessions(userId);

      res.status(200).json({
        success: true,
        data: sessions,
        message: `Found ${sessions.length} sessions`,
        timestamp: new Date(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get user sessions',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Update session settings
   * PUT /api/instagram/session/:sessionId
   */
  async updateSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const updates = req.body;

      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'Session ID is required',
          timestamp: new Date(),
        });
        return;
      }

      const result = await this.sessionManager.updateSession(sessionId, updates);

      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update session',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Deactivate session
   * DELETE /api/instagram/session/:sessionId
   */
  async deactivateSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'Session ID is required',
          timestamp: new Date(),
        });
        return;
      }

      const result = await this.sessionManager.deactivateSession(sessionId);

      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to deactivate session',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Send direct message
   * POST /api/instagram/message
   */
  async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId, recipientUsername, content, messageType, mediaUrl } = req.body;

      if (!sessionId || !recipientUsername || !content) {
        res.status(400).json({
          success: false,
          error: 'Session ID, recipient username, and content are required',
          timestamp: new Date(),
        });
        return;
      }

      const result = await this.messageHandler.sendMessage(
        sessionId,
        recipientUsername,
        content,
        messageType || 'text',
        mediaUrl
      );

      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send message',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Send bulk messages
   * POST /api/instagram/messages/bulk
   */
  async sendBulkMessages(req: Request, res: Response): Promise<void> {
    try {
      const { 
        sessionId, 
        recipients, 
        content, 
        messageType, 
        mediaUrl, 
        delayBetweenMessages 
      } = req.body;

      if (!sessionId || !recipients || !content || !Array.isArray(recipients)) {
        res.status(400).json({
          success: false,
          error: 'Session ID, recipients array, and content are required',
          timestamp: new Date(),
        });
        return;
      }

      const result = await this.messageHandler.sendBulkMessages(
        sessionId,
        recipients,
        content,
        messageType || 'text',
        mediaUrl,
        delayBetweenMessages || 30000
      );

      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send bulk messages',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Get conversation messages
   * GET /api/instagram/conversation/:conversationId/messages
   */
  async getConversationMessages(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId, conversationId } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      if (!sessionId || !conversationId) {
        res.status(400).json({
          success: false,
          error: 'Session ID and conversation ID are required',
          timestamp: new Date(),
        });
        return;
      }

      const result = await this.messageHandler.getConversationMessages(
        sessionId,
        conversationId,
        Number(limit),
        Number(offset)
      );

      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get conversation messages',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Get user conversations
   * GET /api/instagram/session/:sessionId/conversations
   */
  async getUserConversations(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'Session ID is required',
          timestamp: new Date(),
        });
        return;
      }

      const result = await this.messageHandler.getUserConversations(sessionId);

      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get user conversations',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Mark message as read
   * PUT /api/instagram/message/:messageId/read
   */
  async markMessageAsRead(req: Request, res: Response): Promise<void> {
    try {
      const { messageId } = req.params;

      if (!messageId) {
        res.status(400).json({
          success: false,
          error: 'Message ID is required',
          timestamp: new Date(),
        });
        return;
      }

      const result = await this.messageHandler.markMessageAsRead(messageId);

      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to mark message as read',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Delete message
   * DELETE /api/instagram/message/:messageId
   */
  async deleteMessage(req: Request, res: Response): Promise<void> {
    try {
      const { messageId } = req.params;

      if (!messageId) {
        res.status(400).json({
          success: false,
          error: 'Message ID is required',
          timestamp: new Date(),
        });
        return;
      }

      const result = await this.messageHandler.deleteMessage(messageId);

      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete message',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Get message statistics
   * GET /api/instagram/session/:sessionId/messages/stats
   */
  async getMessageStats(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { period = 'day' } = req.query;

      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'Session ID is required',
          timestamp: new Date(),
        });
        return;
      }

      const result = await this.messageHandler.getMessageStats(
        sessionId,
        period as 'day' | 'week' | 'month'
      );

      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get message statistics',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Like a post
   * POST /api/instagram/actions/like
   */
  async likePost(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId, postId } = req.body;

      if (!sessionId || !postId) {
        res.status(400).json({
          success: false,
          error: 'Session ID and post ID are required',
          timestamp: new Date(),
        });
        return;
      }

      // Add to queue for processing
      // This would be implemented with the queue service
      res.status(200).json({
        success: true,
        message: 'Like action queued for processing',
        timestamp: new Date(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to like post',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Comment on a post
   * POST /api/instagram/actions/comment
   */
  async commentPost(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId, postId, content } = req.body;

      if (!sessionId || !postId || !content) {
        res.status(400).json({
          success: false,
          error: 'Session ID, post ID, and content are required',
          timestamp: new Date(),
        });
        return;
      }

      // Add to queue for processing
      res.status(200).json({
        success: true,
        message: 'Comment action queued for processing',
        timestamp: new Date(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to comment on post',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Follow a user
   * POST /api/instagram/actions/follow
   */
  async followUser(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId, userId } = req.body;

      if (!sessionId || !userId) {
        res.status(400).json({
          success: false,
          error: 'Session ID and user ID are required',
          timestamp: new Date(),
        });
        return;
      }

      // Add to queue for processing
      res.status(200).json({
        success: true,
        message: 'Follow action queued for processing',
        timestamp: new Date(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to follow user',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Get session statistics
   * GET /api/instagram/sessions/stats
   */
  async getSessionStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.sessionManager.getSessionStats();

      res.status(200).json({
        success: true,
        data: stats,
        timestamp: new Date(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get session statistics',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Check if user can create session
   * GET /api/instagram/sessions/can-create/:userId
   */
  async canCreateSession(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'User ID is required',
          timestamp: new Date(),
        });
        return;
      }

      const canCreate = await this.sessionManager.canCreateSession(userId);

      res.status(200).json({
        success: true,
        data: { canCreate },
        timestamp: new Date(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check session creation capability',
        timestamp: new Date(),
      });
    }
  }
}

export default InstagramController; 