import { Router } from 'express';
import { FirebaseFunctionController } from '../controllers/firebaseFunctionController';
import { validateFirebaseFunction } from '../validators/firebaseFunctionValidator';
import { authenticateToken } from '../middleware/auth';
import { rateLimiter } from '../middleware';

const router = Router();
const firebaseFunctionController = new FirebaseFunctionController();

// Apply authentication to all routes
router.use(authenticateToken);

// Create Firebase function
router.post('/', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 50 }), // 15 minutes, 50 requests
  validateFirebaseFunction.createFirebaseFunction,
  firebaseFunctionController.createFirebaseFunction
);

// Get Firebase function by ID
router.get('/:functionId', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 200 }),
  firebaseFunctionController.getFirebaseFunction
);

// Get all Firebase functions
router.get('/', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 200 }),
  validateFirebaseFunction.getAllFirebaseFunctions,
  firebaseFunctionController.getAllFirebaseFunctions
);

// Update Firebase function
router.put('/:functionId', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 100 }),
  validateFirebaseFunction.updateFirebaseFunction,
  firebaseFunctionController.updateFirebaseFunction
);

// Delete Firebase function
router.delete('/:functionId', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 20 }),
  firebaseFunctionController.deleteFirebaseFunction
);

// Deploy Firebase function
router.post('/:functionId/deploy', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 10 }),
  firebaseFunctionController.deployFunction
);

// Undeploy Firebase function
router.post('/:functionId/undeploy', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 10 }),
  firebaseFunctionController.undeployFunction
);

// Toggle function active status
router.patch('/:functionId/toggle', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 50 }),
  firebaseFunctionController.toggleFunctionActive
);

// Get function logs
router.get('/:functionId/logs', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 100 }),
  validateFirebaseFunction.getFunctionLogs,
  firebaseFunctionController.getFunctionLogs
);

// Get function statistics
router.get('/:functionId/stats', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 100 }),
  firebaseFunctionController.getFunctionStats
);

// Get all function statistics
router.get('/stats/overview', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 100 }),
  firebaseFunctionController.getAllFunctionStats
);

// Validate function code
router.post('/validate', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 100 }),
  validateFirebaseFunction.validateFunctionCode,
  firebaseFunctionController.validateFunctionCode
);

export default router; 