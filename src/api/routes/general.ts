import { Router } from 'express';
import { GeneralController } from '@/api/controllers/GeneralController';

const router = Router();
const generalController = new GeneralController();

// Health and Status
router.get('/health', generalController.healthCheck.bind(generalController));
router.get('/info', generalController.getInfo.bind(generalController));
router.get('/stats', generalController.getStats.bind(generalController));

// Queue Management
router.get('/queue-status', generalController.getQueueStatus.bind(generalController));

// Webhooks
router.post('/webhook', generalController.handleWebhook.bind(generalController));

// Broadcasting
router.post('/broadcast', generalController.broadcastMessage.bind(generalController));

// Maintenance
router.post('/cleanup', generalController.cleanup.bind(generalController));

export default router; 