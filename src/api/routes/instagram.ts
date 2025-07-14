import { Router } from 'express';
import { InstagramController } from '../controllers/InstagramController';
import { authenticateToken } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimit';
import { validateRequest } from '../middleware/validation';
import { z } from 'zod';

const router = Router();

// Validation schemas
const loginSchema = z.object({
  body: z.object({
    username: z.string().min(1, 'Username is required'),
    password: z.string().min(1, 'Password is required'),
    twoFactorCode: z.string().optional(),
    config: z.object({
      headless: z.boolean().optional(),
      userAgent: z.string().optional(),
      proxy: z.object({
        host: z.string(),
        port: z.number(),
        username: z.string().optional(),
        password: z.string().optional(),
      }).optional(),
      timeout: z.number().optional(),
      retryAttempts: z.number().optional(),
    }).optional(),
  }),
});

const sendMessageSchema = z.object({
  body: z.object({
    sessionId: z.string().min(1, 'Session ID is required'),
    recipientUsername: z.string().min(1, 'Recipient username is required'),
    content: z.string().min(1, 'Content is required'),
    messageType: z.enum(['text', 'image', 'video']).optional(),
    mediaUrl: z.string().url().optional(),
  }),
});

const sendBulkMessagesSchema = z.object({
  body: z.object({
    sessionId: z.string().min(1, 'Session ID is required'),
    recipients: z.array(z.string()).min(1, 'At least one recipient is required'),
    content: z.string().min(1, 'Content is required'),
    messageType: z.enum(['text', 'image', 'video']).optional(),
    mediaUrl: z.string().url().optional(),
    delayBetweenMessages: z.number().min(0).optional(),
  }),
});

const likePostSchema = z.object({
  body: z.object({
    sessionId: z.string().min(1, 'Session ID is required'),
    postId: z.string().min(1, 'Post ID is required'),
  }),
});

const commentPostSchema = z.object({
  body: z.object({
    sessionId: z.string().min(1, 'Session ID is required'),
    postId: z.string().min(1, 'Post ID is required'),
    content: z.string().min(1, 'Content is required'),
  }),
});

const followUserSchema = z.object({
  body: z.object({
    sessionId: z.string().min(1, 'Session ID is required'),
    userId: z.string().min(1, 'User ID is required'),
  }),
});

const updateSessionSchema = z.object({
  body: z.object({
    settings: z.object({
      autoReply: z.boolean().optional(),
      autoLike: z.boolean().optional(),
      autoFollow: z.boolean().optional(),
      autoUnfollow: z.boolean().optional(),
      maxDailyActions: z.number().min(0).optional(),
      actionDelay: z.number().min(0).optional(),
    }).optional(),
    metadata: z.object({
      followersCount: z.number().optional(),
      followingCount: z.number().optional(),
      postsCount: z.number().optional(),
      isBusinessAccount: z.boolean().optional(),
      isVerified: z.boolean().optional(),
      profilePicture: z.string().optional(),
      bio: z.string().optional(),
      website: z.string().optional(),
    }).optional(),
  }),
});

// Initialize controller (this would be injected via dependency injection)
const instagramController = new InstagramController(
  {} as any, // InstagramService
  {} as any, // InstagramSessionManager
  {} as any  // InstagramMessageHandler
);

// Authentication routes
router.post('/login', 
  rateLimiter('login', 5, 300), // 5 attempts per 5 minutes
  validateRequest(loginSchema),
  instagramController.login.bind(instagramController)
);

router.post('/logout/:sessionId',
  authenticateToken,
  rateLimiter('logout', 10, 60), // 10 attempts per minute
  instagramController.logout.bind(instagramController)
);

// Session management routes
router.get('/session/:sessionId',
  authenticateToken,
  rateLimiter('session', 100, 60), // 100 requests per minute
  instagramController.getSession.bind(instagramController)
);

router.get('/sessions/:userId',
  authenticateToken,
  rateLimiter('sessions', 50, 60), // 50 requests per minute
  instagramController.getUserSessions.bind(instagramController)
);

router.put('/session/:sessionId',
  authenticateToken,
  rateLimiter('session', 20, 60), // 20 requests per minute
  validateRequest(updateSessionSchema),
  instagramController.updateSession.bind(instagramController)
);

router.delete('/session/:sessionId',
  authenticateToken,
  rateLimiter('session', 10, 60), // 10 requests per minute
  instagramController.deactivateSession.bind(instagramController)
);

// Messaging routes
router.post('/message',
  authenticateToken,
  rateLimiter('message', 30, 60), // 30 messages per minute
  validateRequest(sendMessageSchema),
  instagramController.sendMessage.bind(instagramController)
);

router.post('/messages/bulk',
  authenticateToken,
  rateLimiter('bulk_message', 5, 300), // 5 bulk operations per 5 minutes
  validateRequest(sendBulkMessagesSchema),
  instagramController.sendBulkMessages.bind(instagramController)
);

router.get('/conversation/:conversationId/messages',
  authenticateToken,
  rateLimiter('messages', 100, 60), // 100 requests per minute
  instagramController.getConversationMessages.bind(instagramController)
);

router.get('/session/:sessionId/conversations',
  authenticateToken,
  rateLimiter('conversations', 50, 60), // 50 requests per minute
  instagramController.getUserConversations.bind(instagramController)
);

router.put('/message/:messageId/read',
  authenticateToken,
  rateLimiter('message', 100, 60), // 100 requests per minute
  instagramController.markMessageAsRead.bind(instagramController)
);

router.delete('/message/:messageId',
  authenticateToken,
  rateLimiter('message', 20, 60), // 20 requests per minute
  instagramController.deleteMessage.bind(instagramController)
);

router.get('/session/:sessionId/messages/stats',
  authenticateToken,
  rateLimiter('stats', 30, 60), // 30 requests per minute
  instagramController.getMessageStats.bind(instagramController)
);

// Action routes
router.post('/actions/like',
  authenticateToken,
  rateLimiter('actions', 50, 60), // 50 actions per minute
  validateRequest(likePostSchema),
  instagramController.likePost.bind(instagramController)
);

router.post('/actions/comment',
  authenticateToken,
  rateLimiter('actions', 20, 60), // 20 actions per minute
  validateRequest(commentPostSchema),
  instagramController.commentPost.bind(instagramController)
);

router.post('/actions/follow',
  authenticateToken,
  rateLimiter('actions', 30, 60), // 30 actions per minute
  validateRequest(followUserSchema),
  instagramController.followUser.bind(instagramController)
);

// Statistics routes
router.get('/sessions/stats',
  authenticateToken,
  rateLimiter('stats', 10, 60), // 10 requests per minute
  instagramController.getSessionStats.bind(instagramController)
);

router.get('/sessions/can-create/:userId',
  authenticateToken,
  rateLimiter('sessions', 50, 60), // 50 requests per minute
  instagramController.canCreateSession.bind(instagramController)
);

export default router; 