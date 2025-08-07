import { Router } from 'express';
import { AutomationRulesController } from '../controllers/automationRulesController';
import { authenticateApiKey } from '../middleware/auth';
import { RateLimitMiddleware } from '../middleware/rateLimit';
import { sanitizeInput } from '../middleware/sanitization';
import { validateAutomationRule } from '../validators/automationRuleValidator';

const router = Router();
const automationRulesController = new AutomationRulesController();

/**
 * @route GET /users/:userId/rules
 * @desc Get all automation rules for a user
 * @access Private
 */
router.get(
  '/users/:userId/rules',
  authenticateApiKey,
  RateLimitMiddleware.default,
  sanitizeInput,
  automationRulesController.getUserRules.bind(automationRulesController)
);

/**
 * @route POST /users/:userId/rules
 * @desc Create a new automation rule
 * @access Private
 */
router.post(
  '/users/:userId/rules',
  authenticateApiKey,
  RateLimitMiddleware.default,
  sanitizeInput,
  validateAutomationRule,
  automationRulesController.createRule.bind(automationRulesController)
);

/**
 * @route GET /users/:userId/rules/:ruleId
 * @desc Get a specific automation rule
 * @access Private
 */
router.get(
  '/users/:userId/rules/:ruleId',
  authenticateApiKey,
  RateLimitMiddleware.default,
  sanitizeInput,
  automationRulesController.getRule.bind(automationRulesController)
);

/**
 * @route PUT /users/:userId/rules/:ruleId
 * @desc Update an automation rule
 * @access Private
 */
router.put(
  '/users/:userId/rules/:ruleId',
  authenticateApiKey,
  RateLimitMiddleware.default,
  sanitizeInput,
  validateAutomationRule,
  automationRulesController.updateRule.bind(automationRulesController)
);

/**
 * @route DELETE /users/:userId/rules/:ruleId
 * @desc Delete an automation rule
 * @access Private
 */
router.delete(
  '/users/:userId/rules/:ruleId',
  authenticateApiKey,
  RateLimitMiddleware.default,
  sanitizeInput,
  automationRulesController.deleteRule.bind(automationRulesController)
);

/**
 * @route PATCH /users/:userId/rules/:ruleId/toggle
 * @desc Toggle rule activation status
 * @access Private
 */
router.patch(
  '/users/:userId/rules/:ruleId/toggle',
  authenticateApiKey,
  RateLimitMiddleware.default,
  sanitizeInput,
  automationRulesController.toggleRuleStatus.bind(automationRulesController)
);

/**
 * @route GET /users/:userId/rules/statistics
 * @desc Get automation rules statistics
 * @access Private
 */
router.get(
  '/users/:userId/rules/statistics',
  authenticateApiKey,
  RateLimitMiddleware.default,
  sanitizeInput,
  automationRulesController.getRulesStatistics.bind(automationRulesController)
);

/**
 * @route POST /users/:userId/rules/bulk
 * @desc Perform bulk operations on automation rules
 * @access Private
 */
router.post(
  '/users/:userId/rules/bulk',
  authenticateApiKey,
  RateLimitMiddleware.default,
  sanitizeInput,
  automationRulesController.bulkOperations.bind(automationRulesController)
);

/**
 * @route GET /users/:userId/rules/health
 * @desc Health check for automation rules service
 * @access Private
 */
router.get(
  '/users/:userId/rules/health',
  authenticateApiKey,
  RateLimitMiddleware.default,
  sanitizeInput,
  automationRulesController.healthCheck.bind(automationRulesController)
);

export default router; 