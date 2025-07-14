import { Router } from 'express';
import { WhatsAppController } from '@/api/controllers/WhatsAppController';

const router = Router();
const whatsappController = new WhatsAppController();

// Session Management
router.get('/status/:sessionId', whatsappController.getStatus.bind(whatsappController));
router.post('/connect/:sessionId', whatsappController.connect.bind(whatsappController));
router.delete('/disconnect/:sessionId', whatsappController.disconnect.bind(whatsappController));
router.delete('/sessions/:sessionId', whatsappController.deleteSession.bind(whatsappController));
router.get('/sessions', whatsappController.getSessions.bind(whatsappController));

// Message Operations
router.post('/send-message/:sessionId', whatsappController.sendMessage.bind(whatsappController));
router.post('/send-media/:sessionId', whatsappController.sendMedia.bind(whatsappController));
router.post('/send-bulk/:sessionId', whatsappController.sendBulkMessages.bind(whatsappController));

// Message Retrieval
router.get('/messages/:sessionId', whatsappController.getMessages.bind(whatsappController));
router.get('/messages/:sessionId/:messageId', whatsappController.getMessage.bind(whatsappController));

// Statistics and Monitoring
router.get('/stats/:sessionId', whatsappController.getStats.bind(whatsappController));

// Webhooks
router.post('/webhook/:sessionId', whatsappController.handleWebhook.bind(whatsappController));

export default router; 