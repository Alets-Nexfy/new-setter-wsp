import { Router } from 'express';
import { InitialTriggerController } from '../controllers/initialTriggerController';
import { validateInitialTrigger } from '../validators/initialTriggerValidator';
import { authenticateToken } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';

const router = Router();
const initialTriggerController = new InitialTriggerController();

// Apply authentication to all routes
router.use(authenticateToken);

// Create initial trigger
router.post('/', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), // 15 minutes, 100 requests
  validateInitialTrigger.createInitialTrigger,
  initialTriggerController.createInitialTrigger
);

// Get initial trigger by ID
router.get('/:triggerId', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 200 }),
  initialTriggerController.getInitialTrigger
);

// Get user's initial triggers
router.get('/user/:userId', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 200 }),
  validateInitialTrigger.getUserInitialTriggers,
  initialTriggerController.getUserInitialTriggers
);

// Update initial trigger
router.put('/:triggerId', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 100 }),
  validateInitialTrigger.updateInitialTrigger,
  initialTriggerController.updateInitialTrigger
);

// Delete initial trigger
router.delete('/:triggerId', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 50 }),
  initialTriggerController.deleteInitialTrigger
);

// Toggle initial trigger active status
router.patch('/:triggerId/toggle', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 100 }),
  initialTriggerController.toggleInitialTrigger
);

// Execute initial trigger
router.post('/:triggerId/execute', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 50 }),
  validateInitialTrigger.executeInitialTrigger,
  initialTriggerController.executeInitialTrigger
);

// Get initial trigger statistics
router.get('/user/:userId/stats', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 100 }),
  initialTriggerController.getInitialTriggerStats
);

// Duplicate initial trigger
router.post('/:triggerId/duplicate', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 50 }),
  validateInitialTrigger.duplicateInitialTrigger,
  initialTriggerController.duplicateInitialTrigger
);

// Test initial trigger conditions
router.post('/test/conditions', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 100 }),
  validateInitialTrigger.testInitialTriggerConditions,
  initialTriggerController.testInitialTriggerConditions
);

export default router; 