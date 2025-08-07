import { Router } from 'express';
import whatsappRoutes from './whatsapp';
import agentsRoutes from './agents';
import agentTriggersRoutes from './agentTriggers';
import actionFlowsRoutes from './actionFlows';
import aiRoutes from './ai';
import generalRoutes from './general';
import promptGeneratorRoutes from './promptGenerator';
import tierManagementRoutes from './tierManagement';
import multiAgentRoutes from './multiAgent';
import b2bRoutes from './b2b';
import monitoringRoutes from './monitoring';
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
router.use('/triggers', agentTriggersRoutes);
router.use('/action-flows', actionFlowsRoutes);
router.use('/ai', aiRoutes);
router.use('/general', generalRoutes);
router.use('/prompt-generator', promptGeneratorRoutes);
router.use('/tier-management', tierManagementRoutes);
router.use('/multi-agent', multiAgentRoutes);
router.use('/b2b', b2bRoutes);
router.use('/monitoring', monitoringRoutes);

// Legacy V1 compatibility routes
router.use('/users', agentsRoutes); // For backward compatibility

export default router; 