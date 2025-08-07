import { Router } from 'express';
import { ChatExtensionController } from '../controllers/chatExtensionController';
import { validateChatExtension } from '../validators/chatExtensionValidator';
import { authenticateToken } from '../middleware/auth';
import { RateLimitMiddleware } from '../middleware/rateLimit';

const router = Router();
const chatExtensionController = new ChatExtensionController();

// Apply authentication to all routes
router.use(authenticateToken);

// Create chat extension
router.post('/', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 100 }), // 15 minutes, 100 requests
  validateChatExtension.createChatExtension,
  chatExtensionController.createChatExtension
);

// Get chat extension by ID
router.get('/:extensionId', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 200 }),
  chatExtensionController.getChatExtension
);

// Get user's chat extensions
router.get('/user/:userId', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 200 }),
  validateChatExtension.getUserChatExtensions,
  chatExtensionController.getUserChatExtensions
);

// Update chat extension
router.put('/:extensionId', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 100 }),
  validateChatExtension.updateChatExtension,
  chatExtensionController.updateChatExtension
);

// Delete chat extension
router.delete('/:extensionId', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 50 }),
  chatExtensionController.deleteChatExtension
);

// Toggle chat extension active status
router.patch('/:extensionId/toggle', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 100 }),
  chatExtensionController.toggleChatExtension
);

// Increment usage count
router.patch('/:extensionId/usage', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 200 }),
  chatExtensionController.incrementUsage
);

// Get popular extensions
router.get('/user/:userId/popular', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 200 }),
  validateChatExtension.getPopularExtensions,
  chatExtensionController.getPopularExtensions
);

// Search extensions
router.get('/user/:userId/search', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 200 }),
  validateChatExtension.searchExtensions,
  chatExtensionController.searchExtensions
);

// Get extension statistics
router.get('/user/:userId/stats', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 100 }),
  chatExtensionController.getExtensionStats
);

// Duplicate extension
router.post('/:extensionId/duplicate', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 50 }),
  validateChatExtension.duplicateExtension,
  chatExtensionController.duplicateExtension
);

export default router; 