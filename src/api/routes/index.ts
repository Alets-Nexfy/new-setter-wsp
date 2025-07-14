import { Router } from 'express';
import userRoutes from './userRoutes';
import kanbanRoutes from './kanbanRoutes';
import instagramRoutes from './instagram';
import generalRoutes from './general';
import aiRoutes from './ai';
import whatsappRoutes from './whatsapp';
import automationRulesRoutes from './automationRulesRoutes';
import actionFlowsRoutes from './actionFlowsRoutes';
import nuclearCleanupRoutes from './nuclearCleanupRoutes';
import statisticsRoutes from './statisticsRoutes';
import notificationRoutes from './notificationRoutes';
import botControlRoutes from './botControlRoutes';
import chatExtensionRoutes from './chatExtensionRoutes';
import firebaseFunctionRoutes from './firebaseFunctionRoutes';
import initialTriggerRoutes from './initialTriggerRoutes';

const router = Router();

// Health check route
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'WhatsApp API v2 is running',
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

// API routes
router.use('/api', userRoutes);
router.use('/api', kanbanRoutes);
router.use('/api', instagramRoutes);
router.use('/api', generalRoutes);
router.use('/api', aiRoutes);
router.use('/api', whatsappRoutes);
router.use('/api', automationRulesRoutes);
router.use('/api', actionFlowsRoutes);
router.use('/api', nuclearCleanupRoutes);
router.use('/api', statisticsRoutes);
router.use('/api', notificationRoutes);
router.use('/api', botControlRoutes);
router.use('/api', chatExtensionRoutes);
router.use('/api', firebaseFunctionRoutes);
router.use('/api', initialTriggerRoutes);

// 404 handler
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

export default router; 