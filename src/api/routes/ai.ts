import { Router } from 'express';
import { AIService } from '@/core/services/AIService';
import { AgentService } from '@/core/services/AgentService';

const router = Router();
const aiService = AIService.getInstance();
const agentService = AgentService.getInstance();

// AI Response Generation
router.post('/generate-response', async (req, res) => {
  try {
    const { prompt, options = {} } = req.body;
    
    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required'
      });
    }

    const response = await aiService.generateResponse(prompt, options);
    
    res.json({
      success: response.success,
      data: response.success ? {
        content: response.content,
        tokensUsed: response.tokensUsed,
        retryCount: response.retryCount
      } : null,
      error: response.error
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate response'
    });
  }
});

// Conversation Response (with context)
router.post('/:userId/conversation-response', async (req, res) => {
  try {
    const { userId } = req.params;
    const { chatId, message, agentId, options = {} } = req.body;
    
    if (!chatId || !message) {
      return res.status(400).json({
        success: false,
        error: 'Chat ID and message are required'
      });
    }

    // Get agent configuration
    const agentConfig = await agentService.getAgentConfigForAI(userId, agentId);
    
    const response = await aiService.generateConversationResponse(
      userId,
      chatId,
      message,
      agentConfig,
      options
    );
    
    res.json({
      success: response.success,
      data: response.success ? {
        content: response.content,
        tokensUsed: response.tokensUsed,
        retryCount: response.retryCount
      } : null,
      error: response.error
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate conversation response'
    });
  }
});

// Starter Response
router.post('/starter-response', async (req, res) => {
  try {
    const { starterPrompt, options = {} } = req.body;
    
    if (!starterPrompt) {
      return res.status(400).json({
        success: false,
        error: 'Starter prompt is required'
      });
    }

    const response = await aiService.generateStarterResponse(starterPrompt, options);
    
    res.json({
      success: response.success,
      data: response.success ? {
        content: response.content,
        tokensUsed: response.tokensUsed,
        retryCount: response.retryCount
      } : null,
      error: response.error
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate starter response'
    });
  }
});

// Assisted Prompt Generation
router.post('/generate-assisted-prompt', async (req, res) => {
  try {
    const response = await aiService.generateAssistedPrompt(req.body);
    
    res.json({
      success: response.success,
      data: response.success ? {
        generatedPrompt: response.content,
        tokensUsed: response.tokensUsed
      } : null,
      error: response.error
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate assisted prompt'
    });
  }
});

// Build Conversation Prompt
router.post('/:userId/build-prompt', async (req, res) => {
  try {
    const { userId } = req.params;
    const { chatId, currentMessage, agentId, maxHistoryTokens } = req.body;
    
    if (!chatId || !currentMessage) {
      return res.status(400).json({
        success: false,
        error: 'Chat ID and current message are required'
      });
    }

    // Get agent configuration
    const agentConfig = await agentService.getAgentConfigForAI(userId, agentId);
    
    const prompt = await aiService.buildConversationPrompt(
      userId,
      chatId,
      currentMessage,
      agentConfig,
      maxHistoryTokens
    );
    
    res.json({
      success: true,
      data: {
        prompt,
        estimatedTokens: Math.ceil(prompt.length / 4)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to build conversation prompt'
    });
  }
});

// Rate Limiting and Token Tracking
router.get('/:userId/rate-limit-status', async (req, res) => {
  try {
    const { userId } = req.params;
    const status = aiService.getRateLimitStatus(userId);
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get rate limit status'
    });
  }
});

router.get('/:userId/token-tracking/:chatId', async (req, res) => {
  try {
    const { userId, chatId } = req.params;
    const tracking = aiService.getTokenTracking(userId, chatId);
    
    res.json({
      success: true,
      data: tracking
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get token tracking'
    });
  }
});

router.delete('/:userId/rate-limit', async (req, res) => {
  try {
    const { userId } = req.params;
    aiService.clearRateLimit(userId);
    
    res.json({
      success: true,
      message: 'Rate limit cleared'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear rate limit'
    });
  }
});

// Service Status
router.get('/status', async (req, res) => {
  try {
    const status = aiService.getStatus();
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get AI service status'
    });
  }
});

export default router; 