import { Router } from 'express';
import { BotControlController } from '../controllers/botControlController';
import { validateBotControl } from '../validators/botControlValidator';
import { authenticateToken } from '../middleware/auth';
import { RateLimitMiddleware } from '../middleware/rateLimit';

const router = Router();
const botControlController = new BotControlController();

// Bind controller methods
const createBotControl = botControlController.createBotControl.bind(botControlController);
const getBotControl = botControlController.getBotControl.bind(botControlController);
const getUserBotControls = botControlController.getUserBotControls.bind(botControlController);
const updateBotControl = botControlController.updateBotControl.bind(botControlController);
const pauseBot = botControlController.pauseBot.bind(botControlController);
const resumeBot = botControlController.resumeBot.bind(botControlController);
const stopBot = botControlController.stopBot.bind(botControlController);
const updateBotActivity = botControlController.updateBotActivity.bind(botControlController);
const getAllBotStatuses = botControlController.getAllBotStatuses.bind(botControlController);
const getInactiveBots = botControlController.getInactiveBots.bind(botControlController);
const deleteBotControl = botControlController.deleteBotControl.bind(botControlController);
const cleanupOldBotControls = botControlController.cleanupOldBotControls.bind(botControlController);

// Apply authentication to all routes
router.use(authenticateToken);

// Create bot control
router.post('/', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 50 }),
  validateBotControl.createBotControl,
  createBotControl
);

// Get bot control for user and platform
router.get('/user/:userId/platform/:platform', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 200 }),
  getBotControl
);

// Get all bot controls for user
router.get('/user/:userId', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 200 }),
  getUserBotControls
);

// Update bot control
router.put('/:botControlId', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 100 }),
  validateBotControl.updateBotControl,
  updateBotControl
);

// Pause bot
router.post('/user/:userId/platform/:platform/pause', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 50 }),
  validateBotControl.pauseBot,
  pauseBot
);

// Resume bot
router.post('/user/:userId/platform/:platform/resume', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 50 }),
  resumeBot
);

// Stop bot
router.post('/user/:userId/platform/:platform/stop', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 50 }),
  stopBot
);

// Update bot activity
router.patch('/user/:userId/platform/:platform/activity', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 200 }),
  updateBotActivity
);

// Get all bot statuses (admin only)
router.get('/stats/overview', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 100 }),
  getAllBotStatuses
);

// Get inactive bots (admin only)
router.get('/inactive', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 50 }),
  validateBotControl.getInactiveBots,
  getInactiveBots
);

// Delete bot control
router.delete('/:botControlId', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 20 }),
  deleteBotControl
);

// Cleanup old bot controls (admin only)
router.post('/cleanup/old', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: 5 }),
  validateBotControl.cleanupOldBotControls,
  cleanupOldBotControls
);

export default router; 