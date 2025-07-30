import { Router } from 'express';
import { WhatsAppController } from '../controllers/WhatsAppController';
import { ChatController } from '../controllers/ChatController';
import { MessageController } from '../controllers/MessageController';

const router = Router();
const whatsappController = new WhatsAppController();
const chatController = new ChatController();
const messageController = new MessageController();

// ==========================================
// LEGACY V1 ROUTES (Worker Management)
// ==========================================

// Connection management
router.post('/:userId/connect', whatsappController.connect.bind(whatsappController));
router.post('/:userId/disconnect', whatsappController.disconnect.bind(whatsappController));
router.get('/:userId/status', whatsappController.getWorkerStatus.bind(whatsappController));
router.get('/:userId/qr', whatsappController.getQRCode.bind(whatsappController));
router.get('/:userId/qr/image', whatsappController.getQRImage.bind(whatsappController));
router.get('/:userId/qr/view', whatsappController.viewQR.bind(whatsappController));

// Message sending (legacy)
router.post('/:userId/send-message', whatsappController.sendWorkerMessage.bind(whatsappController));
router.post('/:userId/send', whatsappController.sendWorkerMessage.bind(whatsappController)); // Alias for compatibility

// Agent management
router.put('/:userId/active-agent', whatsappController.setActiveAgent.bind(whatsappController));
router.post('/:userId/pause', whatsappController.pauseBot.bind(whatsappController));

// Worker statistics and management
router.get('/workers/stats', whatsappController.getWorkerStats.bind(whatsappController));
router.post('/workers/cleanup', whatsappController.cleanupWorkers.bind(whatsappController));

// ==========================================
// V2 ROUTES (Modern Architecture)
// ==========================================

// Session management (V2 style)
router.get('/sessions', whatsappController.getSessions.bind(whatsappController));
router.get('/sessions/:sessionId/status', whatsappController.getStatus.bind(whatsappController));
router.post('/sessions/:sessionId/start', whatsappController.startSession.bind(whatsappController));
router.post('/sessions/:sessionId/stop', whatsappController.stopSession.bind(whatsappController));
router.delete('/sessions/:sessionId', whatsappController.deleteSession.bind(whatsappController));

// V2 Message sending
router.post('/sessions/:sessionId/messages', whatsappController.sendMessage.bind(whatsappController));
router.post('/sessions/:sessionId/media', whatsappController.sendMedia.bind(whatsappController));

// V2 Message retrieval
router.get('/sessions/:sessionId/messages', whatsappController.getMessages.bind(whatsappController));
router.get('/sessions/:sessionId/messages/:messageId', whatsappController.getMessage.bind(whatsappController));

// Statistics and monitoring
router.get('/sessions/:sessionId/stats', whatsappController.getStats.bind(whatsappController));

// Webhook handling
router.post('/webhook/:sessionId', whatsappController.handleWebhook.bind(whatsappController));

// ==========================================
// CHAT MANAGEMENT ROUTES (MIGRATED)
// ==========================================

// Chat listing and management
router.get('/chats/:userId', chatController.getChats.bind(chatController));
router.get('/chats/:userId/:chatId', chatController.getChat.bind(chatController));

// Chat operations
router.post('/chats/:userId/:chatId/activate', chatController.activateChat.bind(chatController));
router.post('/chats/:userId/:chatId/deactivate', chatController.deactivateChat.bind(chatController));
router.put('/chats/:userId/:chatId/contact-name', chatController.updateContactName.bind(chatController));

// Bulk operations
router.post('/chats/:userId/reset-activations', chatController.resetChatActivations.bind(chatController));
router.post('/chats/:userId/bulk-operation', chatController.bulkOperation.bind(chatController));

// Chat statistics
router.get('/chats/:userId/statistics', chatController.getStatistics.bind(chatController));

// ==========================================
// MESSAGE MANAGEMENT ROUTES (MIGRATED)
// ==========================================

// Message retrieval
router.get('/messages/:userId/:chatId', messageController.getMessages.bind(messageController));
router.get('/messages/:userId/:chatId/:messageId', messageController.getMessage.bind(messageController));

// Message sending (new broker-based)
router.post('/messages/:userId/:chatId', messageController.sendMessage.bind(messageController));

// Conversation management
router.get('/messages/:userId/:chatId/conversation-history', messageController.getConversationHistory.bind(messageController));
router.delete('/messages/:userId/:chatId/clear-history', messageController.clearHistory.bind(messageController));

// Message statistics
router.get('/messages/:userId/:chatId/statistics', messageController.getMessageStatistics.bind(messageController));

export default router; 