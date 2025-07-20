import { Router } from 'express';
import whatsappRoutes from './whatsapp';
import agentsRoutes from './agents';
import actionFlowsRoutes from './actionFlows';
import aiRoutes from './ai';
import generalRoutes from './general';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

// API Routes
router.use('/whatsapp', whatsappRoutes);
router.use('/agents', agentsRoutes);
router.use('/action-flows', actionFlowsRoutes);
router.use('/ai', aiRoutes);
router.use('/general', generalRoutes);

// Legacy V1 compatibility routes
router.use('/users', agentsRoutes); // For backward compatibility

export default router; 