import { Router } from 'express';
import { MultiAgentController } from '../controllers/MultiAgentController';

const router = Router();
const multiAgentController = new MultiAgentController();

// Multi-agent configuration routes
router.get('/:userId/config', multiAgentController.getConfiguration.bind(multiAgentController));
router.post('/:userId/config', multiAgentController.createConfiguration.bind(multiAgentController));
router.post('/:userId/config/initialize', multiAgentController.initializeDefault.bind(multiAgentController));

// Chat-specific agent state routes
router.get('/:userId/chat/:chatId/state', multiAgentController.getChatState.bind(multiAgentController));
router.post('/:userId/chat/:chatId/switch', multiAgentController.switchAgent.bind(multiAgentController));

// Testing and utilities
router.post('/:userId/triggers/test', multiAgentController.testTriggers.bind(multiAgentController));
router.post('/:userId/upgrade-tier', multiAgentController.upgradeTier.bind(multiAgentController));
router.get('/:userId/stats', multiAgentController.getStats.bind(multiAgentController));

export default router;