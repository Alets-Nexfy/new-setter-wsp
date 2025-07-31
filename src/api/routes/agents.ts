import { Router } from 'express';
import { AgentService } from '../../core/services/AgentService';

const router = Router();
const agentService = AgentService.getInstance();

// Agent CRUD operations
router.get('/:userId/agents', async (req, res) => {
  try {
    const { userId } = req.params;
    const agents = await agentService.getUserAgents(userId);
    
    res.json({
      success: true,
      data: agents
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get agents'
    });
  }
});

router.get('/:userId/agents/:agentId', async (req, res) => {
  try {
    const { userId, agentId } = req.params;
    const agent = await agentService.getAgent(userId, agentId);
    
    res.json({
      success: true,
      data: agent
    });
  } catch (error) {
    const status = error instanceof Error && error.message === 'Agent not found' ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get agent'
    });
  }
});

router.post('/:userId/agents', async (req, res) => {
  try {
    const { userId } = req.params;
    const agent = await agentService.createAgent({
      userId,
      ...req.body
    });
    
    res.status(201).json({
      success: true,
      message: 'Agent created successfully',
      data: agent
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create agent'
    });
  }
});

router.put('/:userId/agents/:agentId', async (req, res) => {
  try {
    const { userId, agentId } = req.params;
    const agent = await agentService.updateAgent({
      userId,
      agentId,
      ...req.body
    });
    
    res.json({
      success: true,
      message: 'Agent updated successfully',
      data: agent
    });
  } catch (error) {
    const status = error instanceof Error && error.message === 'Agent not found' ? 404 : 400;
    res.status(status).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update agent'
    });
  }
});

router.delete('/:userId/agents/:agentId', async (req, res) => {
  try {
    const { userId, agentId } = req.params;
    await agentService.deleteAgent(userId, agentId);
    
    res.json({
      success: true,
      message: 'Agent deleted successfully'
    });
  } catch (error) {
    const status = error instanceof Error && error.message === 'Agent not found' ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete agent'
    });
  }
});

// Active agent management
router.get('/:userId/active-agent', async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await agentService.getActiveAgent(userId);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    const status = error instanceof Error && error.message === 'User not found' ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get active agent'
    });
  }
});

router.put('/:userId/active-agent', async (req, res) => {
  try {
    const { userId } = req.params;
    const { agentId } = req.body;
    
    const result = await agentService.setActiveAgent({
      userId,
      agentId
    });
    
    res.json({
      success: true,
      message: `Active agent set to ${agentId || 'default'}`,
      data: result
    });
  } catch (error) {
    const status = error instanceof Error && 
      (error.message === 'User not found' || error.message.includes('not found')) ? 404 : 400;
    res.status(status).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set active agent'
    });
  }
});

// Agent statistics
router.get('/:userId/agents/statistics', async (req, res) => {
  try {
    const { userId } = req.params;
    const stats = await agentService.getAgentStatistics(userId);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get agent statistics'
    });
  }
});

// Configuration and validation
router.post('/validate-config', async (req, res) => {
  try {
    const validation = agentService.validateAgentConfig(req.body);
    
    res.json({
      success: true,
      data: validation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate config'
    });
  }
});

router.get('/default-config', async (req, res) => {
  try {
    const defaultConfig = agentService.getDefaultConfig();
    
    res.json({
      success: true,
      data: defaultConfig
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get default config'
    });
  }
});

export default router; 