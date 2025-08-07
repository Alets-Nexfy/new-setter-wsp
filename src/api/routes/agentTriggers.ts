import { Router } from 'express';
import { AgentTriggerService } from '../../core/services/AgentTriggerService';
import { LoggerService } from '../../core/services/LoggerService';

const router = Router();
const triggerService = AgentTriggerService.getInstance();
const logger = LoggerService.getInstance();

// Get triggers for an agent
router.get('/:userId/agents/:agentId/triggers', async (req, res) => {
  try {
    const { userId, agentId } = req.params;
    logger.info('Getting agent triggers', { userId, agentId });
    
    const triggers = await triggerService.getAgentTriggers(userId, agentId);
    
    res.json({
      success: true,
      data: triggers
    });
  } catch (error) {
    logger.error('Error getting agent triggers', { error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get triggers'
    });
  }
});

// Update triggers for an agent (this is what the frontend will call)
router.put('/:userId/agents/:agentId/triggers', async (req, res) => {
  try {
    const { userId, agentId } = req.params;
    const { triggers, agentNetwork } = req.body;
    
    logger.info('Updating agent triggers', { 
      userId, 
      agentId, 
      triggersCount: triggers?.length,
      networkSize: agentNetwork?.length 
    });
    
    const result = await triggerService.updateAgentTriggers({
      userId,
      agentId,
      triggers,
      agentNetwork
    });
    
    res.json({
      success: true,
      message: 'Triggers updated successfully',
      data: result
    });
  } catch (error) {
    logger.error('Error updating agent triggers', { error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update triggers'
    });
  }
});

// Activate agent network (activates main agent + all trigger agents)
router.post('/:userId/agents/:agentId/activate-network', async (req, res) => {
  try {
    const { userId, agentId } = req.params;
    
    logger.info('Activating agent network', { userId, agentId });
    
    const result = await triggerService.activateAgentNetwork(userId, agentId);
    
    res.json({
      success: true,
      message: `Agent network activated: ${result.activatedAgents.length} agents`,
      data: result
    });
  } catch (error) {
    logger.error('Error activating agent network', { error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to activate network'
    });
  }
});

// Deactivate agent network
router.post('/:userId/agents/:agentId/deactivate-network', async (req, res) => {
  try {
    const { userId, agentId } = req.params;
    
    logger.info('Deactivating agent network', { userId, agentId });
    
    const result = await triggerService.deactivateAgentNetwork(userId, agentId);
    
    res.json({
      success: true,
      message: 'Agent network deactivated',
      data: result
    });
  } catch (error) {
    logger.error('Error deactivating agent network', { error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to deactivate network'
    });
  }
});

// Get active agent network for a user
router.get('/:userId/active-network', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const network = await triggerService.getActiveNetwork(userId);
    
    res.json({
      success: true,
      data: network
    });
  } catch (error) {
    logger.error('Error getting active network', { error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get active network'
    });
  }
});

export default router;