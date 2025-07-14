import { Router } from 'express';
import { userController } from '../controllers/userController';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { rateLimit } from '../middleware/rateLimit';
import { sanitizeInput } from '../middleware/sanitization';
import { z } from 'zod';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// Apply rate limiting
const userRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per window
  message: 'Too many user requests, please try again later.'
});

router.use(userRateLimit);

// Apply input sanitization
router.use(sanitizeInput);

// Validation schemas
const createUserSchema = z.object({
  body: z.object({
    userId: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
    initialAgentId: z.string().uuid().optional(),
    metadata: z.record(z.any()).optional()
  })
});

const updateUserSchema = z.object({
  body: z.object({
    status: z.enum(['disconnected', 'connecting', 'connected', 'generating_qr', 'error', 'session_destroyed']).optional(),
    activeAgentId: z.string().uuid().nullable().optional(),
    lastError: z.string().nullable().optional()
  }),
  params: z.object({
    userId: z.string().min(1)
  })
});

const connectUserSchema = z.object({
  body: z.object({
    platform: z.enum(['whatsapp', 'instagram']).optional(),
    agentId: z.string().uuid().optional()
  }),
  params: z.object({
    userId: z.string().min(1)
  })
});

const disconnectUserSchema = z.object({
  body: z.object({
    platform: z.enum(['whatsapp', 'instagram']).optional(),
    force: z.boolean().optional()
  }),
  params: z.object({
    userId: z.string().min(1)
  })
});

const getUsersSchema = z.object({
  query: z.object({
    status: z.enum(['disconnected', 'connecting', 'connected', 'generating_qr', 'error', 'session_destroyed']).optional(),
    platform: z.enum(['whatsapp', 'instagram']).optional(),
    hasActiveAgent: z.enum(['true', 'false']).optional(),
    hasErrors: z.enum(['true', 'false']).optional(),
    createdAfter: z.string().datetime().optional(),
    createdBefore: z.string().datetime().optional(),
    search: z.string().optional(),
    sortField: z.enum(['userId', 'status', 'createdAt', 'updatedAt']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    limit: z.string().regex(/^\d+$/).optional(),
    offset: z.string().regex(/^\d+$/).optional()
  })
});

const getUserSchema = z.object({
  params: z.object({
    userId: z.string().min(1)
  }),
  query: z.object({
    includePlatforms: z.enum(['true', 'false']).optional()
  })
});

const getUserStatusSchema = z.object({
  params: z.object({
    userId: z.string().min(1)
  }),
  query: z.object({
    platform: z.enum(['whatsapp', 'instagram']).optional()
  })
});

const bulkOperationSchema = z.object({
  body: z.object({
    operation: z.enum(['connect', 'disconnect', 'delete', 'change_agent']),
    userIds: z.array(z.string().min(1)).min(1).max(100),
    platform: z.enum(['whatsapp', 'instagram']).optional(),
    agentId: z.string().uuid().optional(),
    force: z.boolean().optional()
  })
});

const nuclearCleanupSchema = z.object({
  body: z.object({
    confirmationCode: z.string().min(1),
    force: z.boolean().optional()
  }),
  params: z.object({
    userId: z.string().min(1)
  })
});

const userParamSchema = z.object({
  params: z.object({
    userId: z.string().min(1)
  })
});

const sessionParamSchema = z.object({
  params: z.object({
    userId: z.string().min(1),
    sessionId: z.string().uuid()
  })
});

const userConfigSchema = z.object({
  body: z.object({
    settings: z.object({
      autoReconnect: z.boolean().optional(),
      qrCodeExpiration: z.number().int().min(1).max(60).optional(),
      maxRetries: z.number().int().min(1).max(10).optional(),
      heartbeatInterval: z.number().int().min(10).max(300).optional()
    }).optional(),
    notifications: z.object({
      onConnect: z.boolean().optional(),
      onDisconnect: z.boolean().optional(),
      onError: z.boolean().optional()
    }).optional(),
    platforms: z.object({
      whatsapp: z.object({
        enabled: z.boolean().optional(),
        defaultAgentId: z.string().uuid().optional()
      }).optional(),
      instagram: z.object({
        enabled: z.boolean().optional(),
        defaultAgentId: z.string().uuid().optional()
      }).optional()
    }).optional()
  }),
  params: z.object({
    userId: z.string().min(1)
  })
});

const userActivitySchema = z.object({
  params: z.object({
    userId: z.string().min(1)
  }),
  query: z.object({
    platform: z.enum(['whatsapp', 'instagram']).optional(),
    action: z.string().optional(),
    limit: z.string().regex(/^\d+$/).optional(),
    offset: z.string().regex(/^\d+$/).optional()
  })
});

const workerActionSchema = z.object({
  body: z.object({
    platform: z.enum(['whatsapp', 'instagram']).optional()
  }),
  params: z.object({
    userId: z.string().min(1)
  })
});

const workerInfoSchema = z.object({
  params: z.object({
    userId: z.string().min(1)
  }),
  query: z.object({
    platform: z.enum(['whatsapp', 'instagram']).optional()
  })
});

// User CRUD routes
router.post('/users', validateRequest(createUserSchema), userController.createUser);
router.get('/users', validateRequest(getUsersSchema), userController.getUsers);
router.get('/users/:userId', validateRequest(getUserSchema), userController.getUser);
router.put('/users/:userId', validateRequest(updateUserSchema), userController.updateUser);
router.delete('/users/:userId', validateRequest(userParamSchema), userController.deleteUser);

// Connection management routes
router.post('/users/:userId/connect', validateRequest(connectUserSchema), userController.connectUser);
router.post('/users/:userId/disconnect', validateRequest(disconnectUserSchema), userController.disconnectUser);
router.get('/users/:userId/status', validateRequest(getUserStatusSchema), userController.getUserStatus);

// Bulk operations
router.post('/users/bulk', validateRequest(bulkOperationSchema), userController.bulkOperation);

// Nuclear cleanup (admin only)
const adminRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 requests per hour
  message: 'Too many nuclear cleanup requests, please try again later.'
});

router.post('/users/:userId/nuke', 
  adminRateLimit,
  validateRequest(nuclearCleanupSchema), 
  userController.nuclearCleanup
);

// Analytics and monitoring
router.get('/analytics/users', userController.getUserAnalytics);
router.get('/users/:userId/health', validateRequest(userParamSchema), userController.getUserHealth);

// WebSocket connection
router.get('/users/:userId/ws', validateRequest(userParamSchema), userController.handleWebSocketConnection);

// Session management
router.get('/users/:userId/sessions', validateRequest(userParamSchema), userController.getUserSessions);
router.delete('/users/:userId/sessions/:sessionId', validateRequest(sessionParamSchema), userController.terminateUserSession);

// Configuration management
router.get('/users/:userId/config', validateRequest(userParamSchema), userController.getUserConfig);
router.put('/users/:userId/config', validateRequest(userConfigSchema), userController.updateUserConfig);

// Activity logs
router.get('/users/:userId/activity', validateRequest(userActivitySchema), userController.getUserActivity);

// Worker management
router.get('/users/:userId/worker', validateRequest(workerInfoSchema), userController.getWorkerInfo);
router.post('/users/:userId/worker/restart', validateRequest(workerActionSchema), userController.restartWorker);

export default router; 