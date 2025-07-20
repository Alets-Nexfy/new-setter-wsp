import { Router } from 'express';
import { ActionFlowsController } from '../controllers/actionFlowsController';

const router = Router();
const actionFlowsController = new ActionFlowsController();

// Action Flows CRUD operations
router.get('/:userId/action-flows', actionFlowsController.getActionFlows.bind(actionFlowsController));
router.get('/:userId/action-flows/:flowId', actionFlowsController.getActionFlow.bind(actionFlowsController));
router.post('/:userId/action-flows', actionFlowsController.createActionFlow.bind(actionFlowsController));
router.put('/:userId/action-flows/:flowId', actionFlowsController.updateActionFlow.bind(actionFlowsController));
router.delete('/:userId/action-flows/:flowId', actionFlowsController.deleteActionFlow.bind(actionFlowsController));

// Flow execution
router.post('/:userId/action-flows/:flowId/execute', actionFlowsController.executeFlow.bind(actionFlowsController));

// Flow statistics
router.get('/:userId/action-flows/statistics', actionFlowsController.getFlowStatistics.bind(actionFlowsController));

export default router; 