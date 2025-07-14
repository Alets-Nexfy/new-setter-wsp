import { Router } from 'express';
import { ActionFlowsController } from '../controllers/actionFlowsController';
import { authenticateApiKey } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { sanitizeInput } from '../middleware/sanitization';
import { validateActionFlow } from '../validators/actionFlowValidator';

const router = Router();
const actionFlowsController = new ActionFlowsController();

/**
 * @route GET /users/:userId/action-flows
 * @desc Get all action flows for a user
 * @access Private
 */
router.get(
  '/users/:userId/action-flows',
  authenticateApiKey,
  rateLimiter,
  sanitizeInput,
  actionFlowsController.getUserActionFlows.bind(actionFlowsController)
);

/**
 * @route POST /users/:userId/action-flows
 * @desc Create a new action flow
 * @access Private
 */
router.post(
  '/users/:userId/action-flows',
  authenticateApiKey,
  rateLimiter,
  sanitizeInput,
  validateActionFlow,
  actionFlowsController.createActionFlow.bind(actionFlowsController)
);

/**
 * @route GET /users/:userId/action-flows/:flowId
 * @desc Get a specific action flow
 * @access Private
 */
router.get(
  '/users/:userId/action-flows/:flowId',
  authenticateApiKey,
  rateLimiter,
  sanitizeInput,
  actionFlowsController.getActionFlow.bind(actionFlowsController)
);

/**
 * @route PUT /users/:userId/action-flows/:flowId
 * @desc Update an action flow
 * @access Private
 */
router.put(
  '/users/:userId/action-flows/:flowId',
  authenticateApiKey,
  rateLimiter,
  sanitizeInput,
  validateActionFlow,
  actionFlowsController.updateActionFlow.bind(actionFlowsController)
);

/**
 * @route DELETE /users/:userId/action-flows/:flowId
 * @desc Delete an action flow
 * @access Private
 */
router.delete(
  '/users/:userId/action-flows/:flowId',
  authenticateApiKey,
  rateLimiter,
  sanitizeInput,
  actionFlowsController.deleteActionFlow.bind(actionFlowsController)
);

/**
 * @route POST /users/:userId/action-flows/:flowId/execute
 * @desc Execute an action flow
 * @access Private
 */
router.post(
  '/users/:userId/action-flows/:flowId/execute',
  authenticateApiKey,
  rateLimiter,
  sanitizeInput,
  actionFlowsController.executeActionFlow.bind(actionFlowsController)
);

/**
 * @route PATCH /users/:userId/action-flows/:flowId/toggle
 * @desc Toggle action flow activation status
 * @access Private
 */
router.patch(
  '/users/:userId/action-flows/:flowId/toggle',
  authenticateApiKey,
  rateLimiter,
  sanitizeInput,
  actionFlowsController.toggleActionFlowStatus.bind(actionFlowsController)
);

/**
 * @route GET /users/:userId/action-flows/statistics
 * @desc Get action flows statistics
 * @access Private
 */
router.get(
  '/users/:userId/action-flows/statistics',
  authenticateApiKey,
  rateLimiter,
  sanitizeInput,
  actionFlowsController.getActionFlowsStatistics.bind(actionFlowsController)
);

/**
 * @route POST /users/:userId/action-flows/bulk
 * @desc Perform bulk operations on action flows
 * @access Private
 */
router.post(
  '/users/:userId/action-flows/bulk',
  authenticateApiKey,
  rateLimiter,
  sanitizeInput,
  actionFlowsController.bulkOperations.bind(actionFlowsController)
);

/**
 * @route GET /users/:userId/action-flows/:flowId/executions
 * @desc Get action flow execution history
 * @access Private
 */
router.get(
  '/users/:userId/action-flows/:flowId/executions',
  authenticateApiKey,
  rateLimiter,
  sanitizeInput,
  actionFlowsController.getActionFlowExecutions.bind(actionFlowsController)
);

/**
 * @route POST /users/:userId/action-flows/:flowId/duplicate
 * @desc Duplicate an action flow
 * @access Private
 */
router.post(
  '/users/:userId/action-flows/:flowId/duplicate',
  authenticateApiKey,
  rateLimiter,
  sanitizeInput,
  actionFlowsController.duplicateActionFlow.bind(actionFlowsController)
);

/**
 * @route GET /users/:userId/action-flows/health
 * @desc Health check for action flows service
 * @access Private
 */
router.get(
  '/users/:userId/action-flows/health',
  authenticateApiKey,
  rateLimiter,
  sanitizeInput,
  actionFlowsController.healthCheck.bind(actionFlowsController)
);

export default router; 