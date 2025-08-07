import { Request, Response } from 'express';
import { KanbanService } from '../../core/services/kanbanService';
import { LoggerService } from '../../core/services/LoggerService';
import { SupabaseService } from '../../core/services/SupabaseService';
import { CacheService } from '../../core/services/CacheService';
import { QueueService } from '../../core/services/QueueService';
import { 
  CreateBoardRequest, 
  UpdateBoardRequest, 
  CreateColumnRequest, 
  UpdateColumnRequest, 
  CreateCardRequest, 
  UpdateCardRequest, 
  CreateCommentRequest,
  KanbanFilters,
  KanbanSortOptions
} from '../../shared/types/kanban';

export class KanbanController {
  private kanbanService: KanbanService;
  private logger: LoggerService;
  
  constructor() {
    const db = SupabaseService.getInstance();
    const cache = CacheService.getInstance();
    const queue = QueueService.getInstance();
    const logger = LoggerService.getInstance();
    
    this.kanbanService = new KanbanService(db, cache, queue, logger);
    this.logger = logger;
  }

  // Board operations
  async createBoard(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const boardData: CreateBoardRequest = req.body;
      const board = await this.kanbanService.createBoard(boardData, userId);
      
      this.logger.info(`Board created: ${board.id}`, { userId, boardId: board.id });
      res.json({ success: true, data: board });
    } catch (error) {
      this.logger.error('Error creating board:', error);
      res.status(500).json({ success: false, error: 'Failed to create board' });
    }
  }

  async getBoards(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const boards = await this.kanbanService.getBoards(userId);
      res.json({ success: true, data: boards });
    } catch (error) {
      this.logger.error('Error fetching boards:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch boards' });
    }
  }

  async getBoard(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { boardId } = req.params;
      
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const board = await this.kanbanService.getBoard(boardId);
      if (!board) {
        return res.status(404).json({ success: false, error: 'Board not found' });
      }

      res.json({ success: true, data: board });
    } catch (error) {
      this.logger.error('Error fetching board:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch board' });
    }
  }

  async updateBoard(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { boardId } = req.params;
      const updates: UpdateBoardRequest = req.body;
      
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const board = await this.kanbanService.updateBoard(boardId, updates, userId);
      if (!board) {
        return res.status(404).json({ success: false, error: 'Board not found' });
      }

      this.logger.info(`Board updated: ${boardId}`, { userId, boardId });
      res.json({ success: true, data: board });
    } catch (error) {
      this.logger.error('Error updating board:', error);
      res.status(500).json({ success: false, error: 'Failed to update board' });
    }
  }

  async deleteBoard(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { boardId } = req.params;
      
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      await this.kanbanService.deleteBoard(boardId, userId);
      const success = true;
      if (!success) {
        return res.status(404).json({ success: false, error: 'Board not found' });
      }

      this.logger.info(`Board deleted: ${boardId}`, { userId, boardId });
      res.json({ success: true, message: 'Board deleted successfully' });
    } catch (error) {
      this.logger.error('Error deleting board:', error);
      res.status(500).json({ success: false, error: 'Failed to delete board' });
    }
  }

  // Column operations
  async createColumn(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { boardId } = req.params;
      const columnData: CreateColumnRequest = req.body;
      
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const createColumnData = { ...req.body, boardId };
      const column = await this.kanbanService.createColumn(createColumnData, userId);
      if (!column) {
        return res.status(404).json({ success: false, error: 'Board not found' });
      }

      this.logger.info(`Column created: ${column.id}`, { userId, boardId, columnId: column.id });
      res.json({ success: true, data: column });
    } catch (error) {
      this.logger.error('Error creating column:', error);
      res.status(500).json({ success: false, error: 'Failed to create column' });
    }
  }

  async updateColumn(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { boardId, columnId } = req.params;
      const updates: UpdateColumnRequest = req.body;
      
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const column = await this.kanbanService.updateColumn(columnId, updates, userId);
      if (!column) {
        return res.status(404).json({ success: false, error: 'Column not found' });
      }

      this.logger.info(`Column updated: ${columnId}`, { userId, boardId, columnId });
      res.json({ success: true, data: column });
    } catch (error) {
      this.logger.error('Error updating column:', error);
      res.status(500).json({ success: false, error: 'Failed to update column' });
    }
  }

  async deleteColumn(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { boardId, columnId } = req.params;
      
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      await this.kanbanService.deleteColumn(columnId, userId);
      const success = true;
      if (!success) {
        return res.status(404).json({ success: false, error: 'Column not found' });
      }

      this.logger.info(`Column deleted: ${columnId}`, { userId, boardId, columnId });
      res.json({ success: true, message: 'Column deleted successfully' });
    } catch (error) {
      this.logger.error('Error deleting column:', error);
      res.status(500).json({ success: false, error: 'Failed to delete column' });
    }
  }

  async reorderColumns(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { boardId } = req.params;
      const { columnIds } = req.body;
      
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      if (!Array.isArray(columnIds)) {
        return res.status(400).json({ success: false, error: 'columnIds must be an array' });
      }

      await this.kanbanService.reorderColumns(boardId, columnIds);
      const success = true;
      if (!success) {
        return res.status(404).json({ success: false, error: 'Board not found' });
      }

      this.logger.info(`Columns reordered`, { userId, boardId, columnIds });
      res.json({ success: true, message: 'Columns reordered successfully' });
    } catch (error) {
      this.logger.error('Error reordering columns:', error);
      res.status(500).json({ success: false, error: 'Failed to reorder columns' });
    }
  }

  // Card operations
  async createCard(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { boardId, columnId } = req.params;
      const cardData: CreateCardRequest = req.body;
      
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const createCardData = { ...req.body, boardId, columnId };
      const card = await this.kanbanService.createCard(createCardData, userId);
      if (!card) {
        return res.status(404).json({ success: false, error: 'Column not found' });
      }

      this.logger.info(`Card created: ${card.id}`, { userId, boardId, columnId, cardId: card.id });
      res.json({ success: true, data: card });
    } catch (error) {
      this.logger.error('Error creating card:', error);
      res.status(500).json({ success: false, error: 'Failed to create card' });
    }
  }

  async getCard(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { boardId, cardId } = req.params;
      
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const card = await this.kanbanService.getCard(cardId);
      if (!card) {
        return res.status(404).json({ success: false, error: 'Card not found' });
      }

      res.json({ success: true, data: card });
    } catch (error) {
      this.logger.error('Error fetching card:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch card' });
    }
  }

  async updateCard(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { boardId, cardId } = req.params;
      const updates: UpdateCardRequest = req.body;
      
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const card = await this.kanbanService.updateCard(cardId, updates, userId);
      if (!card) {
        return res.status(404).json({ success: false, error: 'Card not found' });
      }

      this.logger.info(`Card updated: ${cardId}`, { userId, boardId, cardId });
      res.json({ success: true, data: card });
    } catch (error) {
      this.logger.error('Error updating card:', error);
      res.status(500).json({ success: false, error: 'Failed to update card' });
    }
  }

  async moveCard(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { boardId, cardId } = req.params;
      const { targetColumnId, targetPosition } = req.body;
      
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const moveData = { cardId, targetColumnId, targetPosition };
      const card = await this.kanbanService.moveCard(moveData, userId);
      if (!card) {
        return res.status(404).json({ success: false, error: 'Card not found' });
      }

      this.logger.info(`Card moved: ${cardId}`, { userId, boardId, cardId, targetColumnId, targetPosition });
      res.json({ success: true, data: card });
    } catch (error) {
      this.logger.error('Error moving card:', error);
      res.status(500).json({ success: false, error: 'Failed to move card' });
    }
  }

  async deleteCard(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { boardId, cardId } = req.params;
      
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      await this.kanbanService.deleteCard(cardId, userId);
      const success = true;
      if (!success) {
        return res.status(404).json({ success: false, error: 'Card not found' });
      }

      this.logger.info(`Card deleted: ${cardId}`, { userId, boardId, cardId });
      res.json({ success: true, message: 'Card deleted successfully' });
    } catch (error) {
      this.logger.error('Error deleting card:', error);
      res.status(500).json({ success: false, error: 'Failed to delete card' });
    }
  }

  async reorderCards(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { boardId, columnId } = req.params;
      const { cardIds } = req.body;
      
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      if (!Array.isArray(cardIds)) {
        return res.status(400).json({ success: false, error: 'cardIds must be an array' });
      }

      await this.kanbanService.reorderCards(columnId, cardIds);
      const success = true;
      if (!success) {
        return res.status(404).json({ success: false, error: 'Column not found' });
      }

      this.logger.info(`Cards reordered`, { userId, boardId, columnId, cardIds });
      res.json({ success: true, message: 'Cards reordered successfully' });
    } catch (error) {
      this.logger.error('Error reordering cards:', error);
      res.status(500).json({ success: false, error: 'Failed to reorder cards' });
    }
  }

  // Comment operations
  async addComment(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { boardId, cardId } = req.params;
      const commentData: CreateCommentRequest = req.body;
      
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const createCommentData = { ...req.body, cardId };
      const comment = await this.kanbanService.addComment(createCommentData, userId);
      if (!comment) {
        return res.status(404).json({ success: false, error: 'Card not found' });
      }

      this.logger.info(`Comment added: ${comment.id}`, { userId, boardId, cardId, commentId: comment.id });
      res.json({ success: true, data: comment });
    } catch (error) {
      this.logger.error('Error adding comment:', error);
      res.status(500).json({ success: false, error: 'Failed to add comment' });
    }
  }

  async updateComment(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { boardId, cardId, commentId } = req.params;
      const { content } = req.body;
      
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const updateData = { commentId, content };
      const comment = await this.kanbanService.updateComment(updateData, userId);
      if (!comment) {
        return res.status(404).json({ success: false, error: 'Comment not found' });
      }

      this.logger.info(`Comment updated: ${commentId}`, { userId, boardId, cardId, commentId });
      res.json({ success: true, data: comment });
    } catch (error) {
      this.logger.error('Error updating comment:', error);
      res.status(500).json({ success: false, error: 'Failed to update comment' });
    }
  }

  async deleteComment(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { boardId, cardId, commentId } = req.params;
      
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      await this.kanbanService.deleteComment(commentId);
      const success = true;
      if (!success) {
        return res.status(404).json({ success: false, error: 'Comment not found' });
      }

      this.logger.info(`Comment deleted: ${commentId}`, { userId, boardId, cardId, commentId });
      res.json({ success: true, message: 'Comment deleted successfully' });
    } catch (error) {
      this.logger.error('Error deleting comment:', error);
      res.status(500).json({ success: false, error: 'Failed to delete comment' });
    }
  }

  // Search and filter operations
  async searchCards(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { boardId } = req.params;
      const { query, filters, sort, limit, offset } = req.query;
      
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const searchFilters: KanbanFilters = {
        ...(filters && typeof filters === 'string' ? JSON.parse(filters) : {}),
        query: query as string
      };

      const sortOptions: KanbanSortOptions = sort && typeof sort === 'string' ? JSON.parse(sort) : {};

      const result = await this.kanbanService.searchCards(
        userId,
        query as string || '',
        { ...searchFilters, boardId }
      );

      res.json({ success: true, data: result });
    } catch (error) {
      this.logger.error('Error searching cards:', error);
      res.status(500).json({ success: false, error: 'Failed to search cards' });
    }
  }

  // Statistics operations
  async getBoardStats(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { boardId } = req.params;
      
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const stats = await this.kanbanService.getBoardStats(boardId);
      if (!stats) {
        return res.status(404).json({ success: false, error: 'Board not found' });
      }

      res.json({ success: true, data: stats });
    } catch (error) {
      this.logger.error('Error fetching board stats:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch board stats' });
    }
  }

  async getColumnStats(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { boardId, columnId } = req.params;
      
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const stats = await this.kanbanService.getColumnStats(columnId);
      if (!stats) {
        return res.status(404).json({ success: false, error: 'Column not found' });
      }

      res.json({ success: true, data: stats });
    } catch (error) {
      this.logger.error('Error fetching column stats:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch column stats' });
    }
  }

  // Activity operations
  async getCardActivity(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { boardId, cardId } = req.params;
      const { limit, offset } = req.query;
      
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const activities = await this.kanbanService.getCardActivity(cardId);

      res.json({ success: true, data: activities });
    } catch (error) {
      this.logger.error('Error fetching card activity:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch card activity' });
    }
  }

  async getBoardActivity(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { boardId } = req.params;
      const { limit, offset } = req.query;
      
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const activities = await this.kanbanService.getBoardActivity(boardId);

      res.json({ success: true, data: activities });
    } catch (error) {
      this.logger.error('Error fetching board activity:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch board activity' });
    }
  }
}

export const kanbanController = new KanbanController();
export default KanbanController; 