import { Router } from 'express';
import { BotControlController } from '../controllers/botControlController';
import { validateBotControl } from '../validators/botControlValidator';
import { authenticateToken } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';

const router = Router();
const botControlController = new BotControlController();

// Apply authentication to all routes
router.use(authenticateToken);

// Create bot control
router.post('/', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 50 }), // 15 minutes, 50 requests
  validateBotControl.createBotControl,
  botControlController.createBotControl
);

// Get bot control for user and platform
router.get('/user/:userId/platform/:platform', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 200 }),
  botControlController.getBotControl
);

// Get all bot controls for user
router.get('/user/:userId', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 200 }),
  botControlController.getUserBotControls
);

// Update bot control
router.put('/:botControlId', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 100 }),
  validateBotControl.updateBotControl,
  botControlController.updateBotControl
);

// Pause bot
router.post('/user/:userId/platform/:platform/pause', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 50 }),
  validateBotControl.pauseBot,
  botControlController.pauseBot
);

// Resume bot
router.post('/user/:userId/platform/:platform/resume', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 50 }),
  botControlController.resumeBot
);

// Stop bot
router.post('/user/:userId/platform/:platform/stop', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 50 }),
  botControlController.stopBot
);

// Update bot activity
router.patch('/user/:userId/platform/:platform/activity', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 200 }),
  botControlController.updateBotActivity
);

// Get all bot statuses (admin only)
router.get('/stats/overview', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 100 }),
  botControlController.getAllBotStatuses
);

// Get inactive bots (admin only)
router.get('/inactive', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 50 }),
  validateBotControl.getInactiveBots,
  botControlController.getInactiveBots
);

// Delete bot control
router.delete('/:botControlId', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 20 }),
  botControlController.deleteBotControl
);

// Cleanup old bot controls (admin only)
router.post('/cleanup/old', 
  rateLimiter({ windowMs: 60 * 60 * 1000, max: 5 }), // 1 hour, 5 requests
  validateBotControl.cleanupOldBotControls,
  botControlController.cleanupOldBotControls
);

export default router; 