import { Router } from 'express';
import { FirebaseFunctionController } from '../controllers/firebaseFunctionController';
import { validateFirebaseFunction } from '../validators/firebaseFunctionValidator';
import { authenticateToken } from '../middleware/auth';
import { RateLimitMiddleware } from '../middleware/rateLimit';

const router = Router();
const firebaseFunctionController = new FirebaseFunctionController();

// Apply authentication to all routes
router.use(authenticateToken);

// Create Firebase function
router.post('/', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 50 }), // 15 minutes, 50 requests
  validateFirebaseFunction.createFirebaseFunction,
  firebaseFunctionController.createFirebaseFunction
);

// Get Firebase function by ID
router.get('/:functionId', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 200 }),
  firebaseFunctionController.getFirebaseFunction
);

// Get all Firebase functions
router.get('/', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 200 }),
  validateFirebaseFunction.getAllFirebaseFunctions,
  firebaseFunctionController.getAllFirebaseFunctions
);

// Update Firebase function
router.put('/:functionId', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 100 }),
  validateFirebaseFunction.updateFirebaseFunction,
  firebaseFunctionController.updateFirebaseFunction
);

// Delete Firebase function
router.delete('/:functionId', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 20 }),
  firebaseFunctionController.deleteFirebaseFunction
);

// Deploy Firebase function
router.post('/:functionId/deploy', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 10 }),
  firebaseFunctionController.deployFunction
);

// Undeploy Firebase function
router.post('/:functionId/undeploy', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 10 }),
  firebaseFunctionController.undeployFunction
);

// Toggle function active status
router.patch('/:functionId/toggle', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 50 }),
  firebaseFunctionController.toggleFunctionActive
);

// Get function logs
router.get('/:functionId/logs', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 100 }),
  validateFirebaseFunction.getFunctionLogs,
  firebaseFunctionController.getFunctionLogs
);

// Get function statistics
router.get('/:functionId/stats', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 100 }),
  firebaseFunctionController.getFunctionStats
);

// Get all function statistics
router.get('/stats/overview', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 100 }),
  firebaseFunctionController.getAllFunctionStats
);

// Validate function code
router.post('/validate', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 100 }),
  validateFirebaseFunction.validateFunctionCode,
  firebaseFunctionController.validateFunctionCode
);

export default router; 