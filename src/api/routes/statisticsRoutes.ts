import { Router } from 'express';
import { StatisticsController } from '../controllers/statisticsController';
import { StatisticsService } from '../../core/services/statisticsService';
import { authenticateApiKey } from '../middleware/auth';
import { rateLimiter } from '../middleware';
import { sanitizeInput } from '../middleware/sanitization';
import { validateStatisticsRequest } from '../validators/statisticsValidator';

const router = Router();

// Initialize services (this would typically be injected)
const db = new (require('../../core/services/DatabaseService').DatabaseService)();
const logger = new (require('../../core/services/LoggerService').LoggerService)();
const cache = new (require('../../core/services/CacheService').CacheService)();
const wsService = new (require('../../core/services/websocketService').WebSocketService)(null);

const statisticsService = new StatisticsService(db, logger, cache, wsService);
const statisticsController = new StatisticsController(statisticsService);

/**
 * @route GET /users/:userId/statistics
 * @desc Get user statistics
 * @access Private
 */
router.get(
  '/users/:userId/statistics',
  authenticateApiKey,
  rateLimiter,
  sanitizeInput,
  validateStatisticsRequest,
  statisticsController.getUserStatistics.bind(statisticsController)
);

/**
 * @route GET /statistics/system
 * @desc Get system statistics
 * @access Private
 */
router.get(
  '/statistics/system',
  authenticateApiKey,
  rateLimiter,
  sanitizeInput,
  validateStatisticsRequest,
  statisticsController.getSystemStatistics.bind(statisticsController)
);

/**
 * @route GET /statistics/messages
 * @desc Get message analytics
 * @access Private
 */
router.get(
  '/statistics/messages',
  authenticateApiKey,
  rateLimiter,
  sanitizeInput,
  validateStatisticsRequest,
  statisticsController.getMessageAnalytics.bind(statisticsController)
);

/**
 * @route GET /statistics/agents
 * @desc Get agent analytics
 * @access Private
 */
router.get(
  '/statistics/agents',
  authenticateApiKey,
  rateLimiter,
  sanitizeInput,
  validateStatisticsRequest,
  statisticsController.getAgentAnalytics.bind(statisticsController)
);

/**
 * @route GET /statistics/realtime
 * @desc Get real-time statistics
 * @access Private
 */
router.get(
  '/statistics/realtime',
  authenticateApiKey,
  rateLimiter,
  sanitizeInput,
  statisticsController.getRealTimeStatistics.bind(statisticsController)
);

/**
 * @route GET /statistics/dashboard
 * @desc Get dashboard statistics
 * @access Private
 */
router.get(
  '/statistics/dashboard',
  authenticateApiKey,
  rateLimiter,
  sanitizeInput,
  validateStatisticsRequest,
  statisticsController.getDashboardStatistics.bind(statisticsController)
);

/**
 * @route POST /statistics/reports
 * @desc Generate statistics report
 * @access Private
 */
router.post(
  '/statistics/reports',
  authenticateApiKey,
  rateLimiter,
  sanitizeInput,
  validateStatisticsRequest,
  statisticsController.generateReport.bind(statisticsController)
);

/**
 * @route GET /statistics/export
 * @desc Export statistics data
 * @access Private
 */
router.get(
  '/statistics/export',
  authenticateApiKey,
  rateLimiter,
  sanitizeInput,
  validateStatisticsRequest,
  statisticsController.exportStatistics.bind(statisticsController)
);

/**
 * @route GET /statistics/health
 * @desc Health check for statistics service
 * @access Private
 */
router.get(
  '/statistics/health',
  authenticateApiKey,
  rateLimiter,
  sanitizeInput,
  statisticsController.healthCheck.bind(statisticsController)
);

export default router; 