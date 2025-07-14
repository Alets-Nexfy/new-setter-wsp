import { Request, Response } from 'express';
import { kanbanService } from '../../core/services/kanbanService';
import { logger } from '../../core/services/logger';
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
  // Board operations
  async createBoard(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const boardData: CreateBoardRequest = req.body;
      const board = await kanbanService.createBoard(userId, boardData);
      
      logger.info(`Board created: ${board.id}`, { userId, boardId: board.id });
      res.json({ success: true, data: board });
    } catch (error) {
      logger.error('Error creating board:', error);
      res.status(500).json({ success: false, error: 'Failed to create board' });
    }
  }

  async getBoards(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const boards = await kanbanService.getUserBoards(userId);
      res.json({ success: true, data: boards });
    } catch (error) {
      logger.error('Error fetching boards:', error);
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

      const board = await kanbanService.getBoard(boardId, userId);
      if (!board) {
        return res.status(404).json({ success: false, error: 'Board not found' });
      }

      res.json({ success: true, data: board });
    } catch (error) {
      logger.error('Error fetching board:', error);
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

      const board = await kanbanService.updateBoard(boardId, userId, updates);
      if (!board) {
        return res.status(404).json({ success: false, error: 'Board not found' });
      }

      logger.info(`Board updated: ${boardId}`, { userId, boardId });
      res.json({ success: true, data: board });
    } catch (error) {
      logger.error('Error updating board:', error);
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

      const success = await kanbanService.deleteBoard(boardId, userId);
      if (!success) {
        return res.status(404).json({ success: false, error: 'Board not found' });
      }

      logger.info(`Board deleted: ${boardId}`, { userId, boardId });
      res.json({ success: true, message: 'Board deleted successfully' });
    } catch (error) {
      logger.error('Error deleting board:', error);
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

      const column = await kanbanService.createColumn(boardId, userId, columnData);
      if (!column) {
        return res.status(404).json({ success: false, error: 'Board not found' });
      }

      logger.info(`Column created: ${column.id}`, { userId, boardId, columnId: column.id });
      res.json({ success: true, data: column });
    } catch (error) {
      logger.error('Error creating column:', error);
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

      const column = await kanbanService.updateColumn(boardId, columnId, userId, updates);
      if (!column) {
        return res.status(404).json({ success: false, error: 'Column not found' });
      }

      logger.info(`Column updated: ${columnId}`, { userId, boardId, columnId });
      res.json({ success: true, data: column });
    } catch (error) {
      logger.error('Error updating column:', error);
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

      const success = await kanbanService.deleteColumn(boardId, columnId, userId);
      if (!success) {
        return res.status(404).json({ success: false, error: 'Column not found' });
      }

      logger.info(`Column deleted: ${columnId}`, { userId, boardId, columnId });
      res.json({ success: true, message: 'Column deleted successfully' });
    } catch (error) {
      logger.error('Error deleting column:', error);
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

      const success = await kanbanService.reorderColumns(boardId, userId, columnIds);
      if (!success) {
        return res.status(404).json({ success: false, error: 'Board not found' });
      }

      logger.info(`Columns reordered`, { userId, boardId, columnIds });
      res.json({ success: true, message: 'Columns reordered successfully' });
    } catch (error) {
      logger.error('Error reordering columns:', error);
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

      const card = await kanbanService.createCard(boardId, columnId, userId, cardData);
      if (!card) {
        return res.status(404).json({ success: false, error: 'Column not found' });
      }

      logger.info(`Card created: ${card.id}`, { userId, boardId, columnId, cardId: card.id });
      res.json({ success: true, data: card });
    } catch (error) {
      logger.error('Error creating card:', error);
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

      const card = await kanbanService.getCard(boardId, cardId, userId);
      if (!card) {
        return res.status(404).json({ success: false, error: 'Card not found' });
      }

      res.json({ success: true, data: card });
    } catch (error) {
      logger.error('Error fetching card:', error);
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

      const card = await kanbanService.updateCard(boardId, cardId, userId, updates);
      if (!card) {
        return res.status(404).json({ success: false, error: 'Card not found' });
      }

      logger.info(`Card updated: ${cardId}`, { userId, boardId, cardId });
      res.json({ success: true, data: card });
    } catch (error) {
      logger.error('Error updating card:', error);
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

      const card = await kanbanService.moveCard(boardId, cardId, targetColumnId, targetPosition, userId);
      if (!card) {
        return res.status(404).json({ success: false, error: 'Card not found' });
      }

      logger.info(`Card moved: ${cardId}`, { userId, boardId, cardId, targetColumnId, targetPosition });
      res.json({ success: true, data: card });
    } catch (error) {
      logger.error('Error moving card:', error);
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

      const success = await kanbanService.deleteCard(boardId, cardId, userId);
      if (!success) {
        return res.status(404).json({ success: false, error: 'Card not found' });
      }

      logger.info(`Card deleted: ${cardId}`, { userId, boardId, cardId });
      res.json({ success: true, message: 'Card deleted successfully' });
    } catch (error) {
      logger.error('Error deleting card:', error);
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

      const success = await kanbanService.reorderCards(boardId, columnId, userId, cardIds);
      if (!success) {
        return res.status(404).json({ success: false, error: 'Column not found' });
      }

      logger.info(`Cards reordered`, { userId, boardId, columnId, cardIds });
      res.json({ success: true, message: 'Cards reordered successfully' });
    } catch (error) {
      logger.error('Error reordering cards:', error);
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

      const comment = await kanbanService.addComment(boardId, cardId, userId, commentData);
      if (!comment) {
        return res.status(404).json({ success: false, error: 'Card not found' });
      }

      logger.info(`Comment added: ${comment.id}`, { userId, boardId, cardId, commentId: comment.id });
      res.json({ success: true, data: comment });
    } catch (error) {
      logger.error('Error adding comment:', error);
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

      const comment = await kanbanService.updateComment(boardId, cardId, commentId, userId, content);
      if (!comment) {
        return res.status(404).json({ success: false, error: 'Comment not found' });
      }

      logger.info(`Comment updated: ${commentId}`, { userId, boardId, cardId, commentId });
      res.json({ success: true, data: comment });
    } catch (error) {
      logger.error('Error updating comment:', error);
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

      const success = await kanbanService.deleteComment(boardId, cardId, commentId, userId);
      if (!success) {
        return res.status(404).json({ success: false, error: 'Comment not found' });
      }

      logger.info(`Comment deleted: ${commentId}`, { userId, boardId, cardId, commentId });
      res.json({ success: true, message: 'Comment deleted successfully' });
    } catch (error) {
      logger.error('Error deleting comment:', error);
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

      const result = await kanbanService.searchCards(
        boardId,
        userId,
        searchFilters,
        sortOptions,
        limit ? parseInt(limit as string) : undefined,
        offset ? parseInt(offset as string) : undefined
      );

      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error searching cards:', error);
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

      const stats = await kanbanService.getBoardStats(boardId, userId);
      if (!stats) {
        return res.status(404).json({ success: false, error: 'Board not found' });
      }

      res.json({ success: true, data: stats });
    } catch (error) {
      logger.error('Error fetching board stats:', error);
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

      const stats = await kanbanService.getColumnStats(boardId, columnId, userId);
      if (!stats) {
        return res.status(404).json({ success: false, error: 'Column not found' });
      }

      res.json({ success: true, data: stats });
    } catch (error) {
      logger.error('Error fetching column stats:', error);
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

      const activities = await kanbanService.getCardActivity(
        boardId,
        cardId,
        userId,
        limit ? parseInt(limit as string) : undefined,
        offset ? parseInt(offset as string) : undefined
      );

      res.json({ success: true, data: activities });
    } catch (error) {
      logger.error('Error fetching card activity:', error);
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

      const activities = await kanbanService.getBoardActivity(
        boardId,
        userId,
        limit ? parseInt(limit as string) : undefined,
        offset ? parseInt(offset as string) : undefined
      );

      res.json({ success: true, data: activities });
    } catch (error) {
      logger.error('Error fetching board activity:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch board activity' });
    }
  }
}

export const kanbanController = new KanbanController(); 