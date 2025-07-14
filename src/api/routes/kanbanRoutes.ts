import { Router } from 'express';
import { kanbanController } from '../controllers/kanbanController';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { rateLimit } from '../middleware/rateLimit';
import { sanitizeInput } from '../middleware/sanitization';
import { z } from 'zod';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// Apply rate limiting
const kanbanRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many kanban requests, please try again later.'
});

router.use(kanbanRateLimit);

// Apply input sanitization
router.use(sanitizeInput);

// Validation schemas
const createBoardSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
    isPrivate: z.boolean().optional(),
    tags: z.array(z.string()).optional()
  })
});

const updateBoardSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
    isPrivate: z.boolean().optional(),
    tags: z.array(z.string()).optional()
  }),
  params: z.object({
    boardId: z.string().uuid()
  })
});

const createColumnSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
    wipLimit: z.number().int().min(0).optional()
  }),
  params: z.object({
    boardId: z.string().uuid()
  })
});

const updateColumnSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
    wipLimit: z.number().int().min(0).optional()
  }),
  params: z.object({
    boardId: z.string().uuid(),
    columnId: z.string().uuid()
  })
});

const reorderColumnsSchema = z.object({
  body: z.object({
    columnIds: z.array(z.string().uuid())
  }),
  params: z.object({
    boardId: z.string().uuid()
  })
});

const createCardSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    labels: z.array(z.string()).optional(),
    dueDate: z.string().datetime().optional(),
    estimatedHours: z.number().positive().optional(),
    assignedTo: z.string().uuid().optional(),
    contactInfo: z.object({
      name: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      company: z.string().optional()
    }).optional(),
    customFields: z.record(z.any()).optional()
  }),
  params: z.object({
    boardId: z.string().uuid(),
    columnId: z.string().uuid()
  })
});

const updateCardSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    labels: z.array(z.string()).optional(),
    dueDate: z.string().datetime().optional(),
    estimatedHours: z.number().positive().optional(),
    assignedTo: z.string().uuid().optional(),
    contactInfo: z.object({
      name: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      company: z.string().optional()
    }).optional(),
    customFields: z.record(z.any()).optional()
  }),
  params: z.object({
    boardId: z.string().uuid(),
    cardId: z.string().uuid()
  })
});

const moveCardSchema = z.object({
  body: z.object({
    targetColumnId: z.string().uuid(),
    targetPosition: z.number().int().min(0)
  }),
  params: z.object({
    boardId: z.string().uuid(),
    cardId: z.string().uuid()
  })
});

const reorderCardsSchema = z.object({
  body: z.object({
    cardIds: z.array(z.string().uuid())
  }),
  params: z.object({
    boardId: z.string().uuid(),
    columnId: z.string().uuid()
  })
});

const createCommentSchema = z.object({
  body: z.object({
    content: z.string().min(1).max(1000)
  }),
  params: z.object({
    boardId: z.string().uuid(),
    cardId: z.string().uuid()
  })
});

const updateCommentSchema = z.object({
  body: z.object({
    content: z.string().min(1).max(1000)
  }),
  params: z.object({
    boardId: z.string().uuid(),
    cardId: z.string().uuid(),
    commentId: z.string().uuid()
  })
});

const searchCardsSchema = z.object({
  params: z.object({
    boardId: z.string().uuid()
  }),
  query: z.object({
    query: z.string().optional(),
    filters: z.string().optional(),
    sort: z.string().optional(),
    limit: z.string().regex(/^\d+$/).optional(),
    offset: z.string().regex(/^\d+$/).optional()
  })
});

const boardParamSchema = z.object({
  params: z.object({
    boardId: z.string().uuid()
  })
});

const cardParamSchema = z.object({
  params: z.object({
    boardId: z.string().uuid(),
    cardId: z.string().uuid()
  })
});

const columnParamSchema = z.object({
  params: z.object({
    boardId: z.string().uuid(),
    columnId: z.string().uuid()
  })
});

const commentParamSchema = z.object({
  params: z.object({
    boardId: z.string().uuid(),
    cardId: z.string().uuid(),
    commentId: z.string().uuid()
  })
});

const activityQuerySchema = z.object({
  query: z.object({
    limit: z.string().regex(/^\d+$/).optional(),
    offset: z.string().regex(/^\d+$/).optional()
  })
});

// Board routes
router.post('/boards', validateRequest(createBoardSchema), kanbanController.createBoard);
router.get('/boards', kanbanController.getBoards);
router.get('/boards/:boardId', validateRequest(boardParamSchema), kanbanController.getBoard);
router.put('/boards/:boardId', validateRequest(updateBoardSchema), kanbanController.updateBoard);
router.delete('/boards/:boardId', validateRequest(boardParamSchema), kanbanController.deleteBoard);

// Column routes
router.post('/boards/:boardId/columns', validateRequest(createColumnSchema), kanbanController.createColumn);
router.put('/boards/:boardId/columns/:columnId', validateRequest(updateColumnSchema), kanbanController.updateColumn);
router.delete('/boards/:boardId/columns/:columnId', validateRequest(columnParamSchema), kanbanController.deleteColumn);
router.post('/boards/:boardId/columns/reorder', validateRequest(reorderColumnsSchema), kanbanController.reorderColumns);

// Card routes
router.post('/boards/:boardId/columns/:columnId/cards', validateRequest(createCardSchema), kanbanController.createCard);
router.get('/boards/:boardId/cards/:cardId', validateRequest(cardParamSchema), kanbanController.getCard);
router.put('/boards/:boardId/cards/:cardId', validateRequest(updateCardSchema), kanbanController.updateCard);
router.post('/boards/:boardId/cards/:cardId/move', validateRequest(moveCardSchema), kanbanController.moveCard);
router.delete('/boards/:boardId/cards/:cardId', validateRequest(cardParamSchema), kanbanController.deleteCard);
router.post('/boards/:boardId/columns/:columnId/cards/reorder', validateRequest(reorderCardsSchema), kanbanController.reorderCards);

// Comment routes
router.post('/boards/:boardId/cards/:cardId/comments', validateRequest(createCommentSchema), kanbanController.addComment);
router.put('/boards/:boardId/cards/:cardId/comments/:commentId', validateRequest(updateCommentSchema), kanbanController.updateComment);
router.delete('/boards/:boardId/cards/:cardId/comments/:commentId', validateRequest(commentParamSchema), kanbanController.deleteComment);

// Search routes
router.get('/boards/:boardId/search', validateRequest(searchCardsSchema), kanbanController.searchCards);

// Statistics routes
router.get('/boards/:boardId/stats', validateRequest(boardParamSchema), kanbanController.getBoardStats);
router.get('/boards/:boardId/columns/:columnId/stats', validateRequest(columnParamSchema), kanbanController.getColumnStats);

// Activity routes
router.get('/boards/:boardId/cards/:cardId/activity', 
  validateRequest({ ...cardParamSchema, ...activityQuerySchema }), 
  kanbanController.getCardActivity
);
router.get('/boards/:boardId/activity', 
  validateRequest({ ...boardParamSchema, ...activityQuerySchema }), 
  kanbanController.getBoardActivity
);

export default router; 