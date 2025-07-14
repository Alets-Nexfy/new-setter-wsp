import { Router } from 'express';
import { NuclearCleanupController } from '../controllers/nuclearCleanupController';
import { NuclearCleanupService } from '../../core/services/nuclearCleanupService';
import { authenticateApiKey } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { sanitizeInput } from '../middleware/sanitization';
import { validateCleanupRequest } from '../validators/nuclearCleanupValidator';

const router = Router();

// Initialize services (this would typically be injected)
const db = new (require('../../core/services/DatabaseService').DatabaseService)();
const logger = new (require('../../core/services/LoggerService').LoggerService)();
const cache = new (require('../../core/services/CacheService').CacheService)();
const queue = new (require('../../core/services/QueueService').QueueService)();
const wsService = new (require('../../core/services/websocketService').WebSocketService)(null);

const nuclearCleanupService = new NuclearCleanupService(db, logger, cache, queue, wsService);
const nuclearCleanupController = new NuclearCleanupController(nuclearCleanupService);

/**
 * @route GET /cleanup/status
 * @desc Get system status
 * @access Private
 */
router.get(
  '/cleanup/status',
  authenticateApiKey,
  rateLimiter,
  sanitizeInput,
  nuclearCleanupController.getSystemStatus.bind(nuclearCleanupController)
);

/**
 * @route GET /cleanup/statistics
 * @desc Get cleanup statistics
 * @access Private
 */
router.get(
  '/cleanup/statistics',
  authenticateApiKey,
  rateLimiter,
  sanitizeInput,
  nuclearCleanupController.getCleanupStatistics.bind(nuclearCleanupController)
);

/**
 * @route GET /cleanup/health
 * @desc Health check for nuclear cleanup service
 * @access Private
 */
router.get(
  '/cleanup/health',
  authenticateApiKey,
  rateLimiter,
  sanitizeInput,
  nuclearCleanupController.healthCheck.bind(nuclearCleanupController)
);

/**
 * @route POST /nuke-all-users
 * @desc Nuclear cleanup for all users
 * @access Private
 */
router.post(
  '/nuke-all-users',
  authenticateApiKey,
  rateLimiter,
  sanitizeInput,
  validateCleanupRequest,
  nuclearCleanupController.nukeAllUsers.bind(nuclearCleanupController)
);

/**
 * @route POST /users/:userId/nuke
 * @desc Nuclear cleanup for a specific user
 * @access Private
 */
router.post(
  '/users/:userId/nuke',
  authenticateApiKey,
  rateLimiter,
  sanitizeInput,
  validateCleanupRequest,
  nuclearCleanupController.nukeUser.bind(nuclearCleanupController)
);

/**
 * @route GET /users/:userId/cleanup/verify
 * @desc Verify user data cleanup
 * @access Private
 */
router.get(
  '/users/:userId/cleanup/verify',
  authenticateApiKey,
  rateLimiter,
  sanitizeInput,
  nuclearCleanupController.verifyUserCleanup.bind(nuclearCleanupController)
);

export default router; 