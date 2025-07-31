import { Router } from 'express';
import { B2BController } from '../controllers/B2BController';

const router = Router();
const b2bController = new B2BController();

/**
 * B2B Enterprise API Routes
 * 
 * These routes handle partner platform integration for enterprise B2B users.
 * All routes are prefixed with /api/b2b
 */

// ========== USER MANAGEMENT ==========

/**
 * @route   POST /api/b2b/users
 * @desc    Create a new B2B enterprise user
 * @access  Platform (requires platform authentication)
 * @body    {
 *   userId: string,
 *   platformId: string,
 *   platformUserId: string,
 *   platformName: string,
 *   platformApiKey?: string
 * }
 */
router.post('/users', b2bController.createB2BUser);

/**
 * @route   POST /api/b2b/users/bulk
 * @desc    Bulk create B2B enterprise users
 * @access  Platform (requires platform authentication)
 * @body    {
 *   users: Array<{userId: string, platformUserId: string}>,
 *   platformId: string,
 *   platformName: string,
 *   platformApiKey?: string
 * }
 */
router.post('/users/bulk', b2bController.bulkCreateB2BUsers);

/**
 * @route   GET /api/b2b/users/:userId
 * @desc    Get B2B user information
 * @access  Platform (requires platform authentication)
 * @params  userId - The user ID
 */
router.get('/users/:userId', b2bController.getB2BUser);

/**
 * @route   PUT /api/b2b/users/:userId
 * @desc    Update B2B user platform information
 * @access  Platform (requires platform authentication)
 * @params  userId - The user ID
 * @body    Partial B2B info updates
 */
router.put('/users/:userId', b2bController.updateB2BUser);

/**
 * @route   GET /api/b2b/users/:userId/status
 * @desc    Get B2B user connection status
 * @access  Platform (requires platform authentication)
 * @params  userId - The user ID
 */
router.get('/users/:userId/status', b2bController.getB2BUserStatus);

/**
 * @route   POST /api/b2b/users/:userId/connect
 * @desc    Connect B2B user to WhatsApp
 * @access  Platform (requires platform authentication)
 * @params  userId - The user ID
 */
router.post('/users/:userId/connect', b2bController.connectB2BUser);

// ========== PLATFORM MANAGEMENT ==========

/**
 * @route   GET /api/b2b/platforms/:platformId/users
 * @desc    Get all users from a specific B2B platform
 * @access  Platform (requires platform authentication)
 * @params  platformId - The platform ID
 * @query   page?, limit? - Pagination parameters
 */
router.get('/platforms/:platformId/users', b2bController.getPlatformUsers);

/**
 * @route   GET /api/b2b/platforms/:platformId/stats
 * @desc    Get B2B platform statistics
 * @access  Platform (requires platform authentication)
 * @params  platformId - The platform ID
 */
router.get('/platforms/:platformId/stats', b2bController.getPlatformStats);

export default router;