import { Router } from 'express';
import { AIController } from '@/api/controllers/AIController';

const router = Router();
const aiController = new AIController();

// AI Response Generation
router.post('/generate-response', aiController.generateResponse.bind(aiController));
router.post('/auto-reply', aiController.generateAutoReply.bind(aiController));
router.post('/queue-response', aiController.queueAIResponse.bind(aiController));

// Analysis and Processing
router.post('/analyze-sentiment', aiController.analyzeSentiment.bind(aiController));
router.post('/summarize', aiController.summarizeConversation.bind(aiController));
router.post('/follow-up-questions', aiController.generateFollowUpQuestions.bind(aiController));

// Health and Monitoring
router.get('/health', aiController.healthCheck.bind(aiController));

export default router; 