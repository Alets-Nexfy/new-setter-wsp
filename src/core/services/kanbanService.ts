import { SupabaseService } from './SupabaseService';
import { CacheService } from './CacheService';
import { QueueService } from './QueueService';
import { LoggerService } from './LoggerService';
import {
  KanbanBoard,
  KanbanColumn,
  KanbanCard,
  KanbanComment,
  KanbanActivity,
  KanbanStats,
  CreateBoardRequest,
  UpdateBoardRequest,
  CreateColumnRequest,
  UpdateColumnRequest,
  CreateCardRequest,
  UpdateCardRequest,
  MoveCardRequest,
  AddCommentRequest,
  UpdateCommentRequest,
  KanbanQueryOptions,
  KanbanFilter,
  KanbanSort
} from '../../shared/types/kanban';

export class KanbanService {
  private db: SupabaseService;
  private cache: CacheService;
  private queue: QueueService;
  private logger: LoggerService;

  constructor(
    db: SupabaseService,
    cache: CacheService,
    queue: QueueService,
    logger: LoggerService
  ) {
    this.db = db;
    this.cache = cache;
    this.queue = queue;
    this.logger = logger;
  }

  // Board Operations
  async createBoard(data: CreateBoardRequest, userId: string): Promise<KanbanBoard> {
    try {
      const board: KanbanBoard = {
        id: `board_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: data.name,
        description: data.description,
        color: data.color,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: userId,
        teamId: data.teamId,
        settings: {
          allowCardCreation: true,
          allowCardEditing: true,
          allowCardDeletion: true,
          allowColumnReordering: true,
          allowCardReordering: true,
          autoArchiveCompleted: false,
          ...(data.settings || {})
        }
      };

      await this.db.from('kanban_boards').insert(board);
      await this.cache.set(`board:${board.id}`, JSON.stringify(board), 3600);
      
      this.logger.info('Board created', { boardId: board.id, userId });
      return board;
    } catch (error) {
      this.logger.error('Error creating board', { error, userId });
      throw error;
    }
  }

  async getBoard(boardId: string): Promise<KanbanBoard | null> {
    try {
      // Try cache first
      const cached = await this.cache.get(`board:${boardId}`);
      if (cached) return JSON.parse(cached) as KanbanBoard;

      const { data: board, error } = await this.db
        .from('kanban_boards')
        .select('*')
        .eq('id', boardId)
        .single();
      
      if (error || !board) return null;
      await this.cache.set(`board:${boardId}`, JSON.stringify(board), 3600);
      return board;
    } catch (error) {
      this.logger.error('Error getting board', { error, boardId });
      throw error;
    }
  }

  async getBoards(userId: string, teamId?: string): Promise<KanbanBoard[]> {
    try {
      let query = this.db.from('kanban_boards').select('*').eq('isActive', true);

      if (teamId) {
        query = query.eq('teamId', teamId);
      } else {
        query = query.eq('createdBy', userId);
      }

      const { data: boards, error } = await query;
      if (error) throw error;
      return boards || [];
    } catch (error) {
      this.logger.error('Error getting boards', { error, userId });
      throw error;
    }
  }

  async updateBoard(boardId: string, data: UpdateBoardRequest, userId: string): Promise<KanbanBoard> {
    try {
      const board = await this.getBoard(boardId);
      if (!board) throw new Error('Board not found');

      const updates = {
        ...data,
        updatedAt: new Date()
      };

      await this.db.from('kanban_boards').update(updates).eq('id', boardId);
      await this.cache.delete(`board:${boardId}`);

      const updatedBoard = { ...board, ...updates } as KanbanBoard;
      this.logger.info('Board updated', { boardId, userId });
      return updatedBoard;
    } catch (error) {
      this.logger.error('Error updating board', { error, boardId, userId });
      throw error;
    }
  }

  async deleteBoard(boardId: string, userId: string): Promise<void> {
    try {
      const board = await this.getBoard(boardId);
      if (!board) throw new Error('Board not found');

      // Soft delete
      await this.db.from('kanban_boards').update({
        isActive: false,
        updatedAt: new Date()
      }).eq('id', boardId);

      await this.cache.delete(`board:${boardId}`);
      this.logger.info('Board deleted', { boardId, userId });
    } catch (error) {
      this.logger.error('Error deleting board', { error, boardId, userId });
      throw error;
    }
  }

  // Column Operations
  async createColumn(data: CreateColumnRequest, userId: string): Promise<KanbanColumn> {
    try {
      const board = await this.getBoard(data.boardId);
      if (!board) throw new Error('Board not found');

      const column: KanbanColumn = {
        id: `board_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        boardId: data.boardId,
        name: data.name,
        description: data.description,
        color: data.color,
        order: data.order || 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: userId,
        settings: {
          allowCardCreation: true,
          allowCardEditing: true,
          allowCardDeletion: true,
          allowCardReordering: true,
          autoArchive: false,
          ...(data.settings || {})
        }
      };

      await this.db.collection('kanban_columns').doc(column.id).set(column);
      await this.cache.delete(`board:${data.boardId}:columns`);
      
      this.logger.info('Column created', { columnId: column.id, boardId: data.boardId, userId });
      return column;
    } catch (error) {
      this.logger.error('Error creating column', { error, boardId: data.boardId, userId });
      throw error;
    }
  }

  async getColumns(boardId: string): Promise<KanbanColumn[]> {
    try {
      const cached = await this.cache.get(`board:${boardId}:columns`);
      if (cached) return JSON.parse(cached) as KanbanColumn[];

      const snapshot = await this.db.collection('kanban_columns')
        .where('boardId', '==', boardId)
        .where('isActive', '==', true)
        .orderBy('order')
        .get();

      const columns = snapshot.docs.map(doc => doc.data() as KanbanColumn);
      await this.cache.set(`board:${boardId}:columns`, JSON.stringify(columns), 3600);
      return columns;
    } catch (error) {
      this.logger.error('Error getting columns', { error, boardId });
      throw error;
    }
  }

  async updateColumn(columnId: string, data: UpdateColumnRequest, userId: string): Promise<KanbanColumn> {
    try {
      const columnDoc = await this.db.collection('kanban_columns').doc(columnId).get();
      if (!columnDoc.exists) throw new Error('Column not found');

      const column = columnDoc.data() as KanbanColumn;
      const updates = {
        ...data,
        updatedAt: new Date()
      };

      await this.db.collection('kanban_columns').doc(columnId).update(updates);
      await this.cache.delete(`board:${column.boardId}:columns`);

      const updatedColumn = { ...column, ...updates } as KanbanColumn;
      this.logger.info('Column updated', { columnId, boardId: column.boardId, userId });
      return updatedColumn;
    } catch (error) {
      this.logger.error('Error updating column', { error, columnId, userId });
      throw error;
    }
  }

  async deleteColumn(columnId: string, userId: string): Promise<void> {
    try {
      const columnDoc = await this.db.collection('kanban_columns').doc(columnId).get();
      if (!columnDoc.exists) throw new Error('Column not found');

      const column = columnDoc.data() as KanbanColumn;

      // Move all cards to archive or delete them
      const cards = await this.getCardsByColumn(columnId);
      for (const card of cards) {
        await this.updateCard(card.id, { status: 'archived' }, userId);
      }

      // Soft delete column
      await this.db.collection('kanban_columns').doc(columnId).update({
        isActive: false,
        updatedAt: new Date()
      });

      await this.cache.delete(`board:${column.boardId}:columns`);
      this.logger.info('Column deleted', { columnId, boardId: column.boardId, userId });
    } catch (error) {
      this.logger.error('Error deleting column', { error, columnId, userId });
      throw error;
    }
  }

  // Card Operations
  async createCard(data: CreateCardRequest, userId: string): Promise<KanbanCard> {
    try {
      const board = await this.getBoard(data.boardId);
      if (!board) throw new Error('Board not found');

      const column = await this.db.collection('kanban_columns').doc(data.columnId).get();
      if (!column.exists) throw new Error('Column not found');

      const lastCard = await this.getLastCardInColumn(data.columnId);
      const order = lastCard ? lastCard.order + 1 : 0;

      const card: KanbanCard = {
        id: `board_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        boardId: data.boardId,
        columnId: data.columnId,
        title: data.title,
        description: data.description,
        priority: data.priority || 'medium',
        status: 'todo',
        assigneeId: data.assigneeId,
        dueDate: data.dueDate,
        tags: data.tags || [],
        attachments: [],
        comments: [],
        activity: [],
        metadata: data.metadata || {},
        order,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: userId,
        lastActivityAt: new Date()
      };

      await this.db.collection('kanban_cards').doc(card.id).set(card);
      await this.cache.delete(`board:${data.boardId}:cards`);
      await this.cache.delete(`column:${data.columnId}:cards`);

      // Add activity
      await this.addActivity(card.id, {
        type: 'created',
        description: 'Card created',
        userId,
        userName: 'User', // TODO: Get from user service
        metadata: { title: card.title }
      });

      this.logger.info('Card created', { cardId: card.id, boardId: data.boardId, userId });
      return card;
    } catch (error) {
      this.logger.error('Error creating card', { error, boardId: data.boardId, userId });
      throw error;
    }
  }

  async getCard(cardId: string): Promise<KanbanCard | null> {
    try {
      const cached = await this.cache.get(`card:${cardId}`);
      if (cached) return JSON.parse(cached) as KanbanCard;

      const doc = await this.db.collection('kanban_cards').doc(cardId).get();
      if (!doc.exists) return null;

      const card = doc.data() as KanbanCard;
      await this.cache.set(`card:${cardId}`, JSON.stringify(card), 1800);
      return card;
    } catch (error) {
      this.logger.error('Error getting card', { error, cardId });
      throw error;
    }
  }

  async getCards(boardId: string, options?: KanbanQueryOptions): Promise<KanbanCard[]> {
    try {
      let query = this.db.collection('kanban_cards')
        .where('boardId', '==', boardId)
        .where('isActive', '==', true);

      if (options?.includeArchived !== true) {
        query = query.where('status', '!=', 'archived');
      }

      const snapshot = await query.get();
      let cards = snapshot.docs.map(doc => doc.data() as KanbanCard);

      // Apply filters
      if (options?.filter) {
        cards = this.applyFilters(cards, options.filter);
      }

      // Apply sorting
      if (options?.sort) {
        cards = this.applySorting(cards, options.sort);
      }

      // Apply pagination
      if (options?.limit) {
        const offset = options.offset || 0;
        cards = cards.slice(offset, offset + options.limit);
      }

      return cards;
    } catch (error) {
      this.logger.error('Error getting cards', { error, boardId });
      throw error;
    }
  }

  async getCardsByColumn(columnId: string): Promise<KanbanCard[]> {
    try {
      const cached = await this.cache.get(`column:${columnId}:cards`);
      if (cached) return JSON.parse(cached) as KanbanCard[];

      const snapshot = await this.db.collection('kanban_cards')
        .where('columnId', '==', columnId)
        .where('isActive', '==', true)
        .orderBy('order')
        .get();

      const cards = snapshot.docs.map(doc => doc.data() as KanbanCard);
      await this.cache.set(`column:${columnId}:cards`, JSON.stringify(cards), 1800);
      return cards;
    } catch (error) {
      this.logger.error('Error getting cards by column', { error, columnId });
      throw error;
    }
  }

  async updateCard(cardId: string, data: UpdateCardRequest, userId: string): Promise<KanbanCard> {
    try {
      const card = await this.getCard(cardId);
      if (!card) throw new Error('Card not found');

      const updates = {
        ...data,
        updatedAt: new Date(),
        lastActivityAt: new Date()
      };

      await this.db.collection('kanban_cards').doc(cardId).update(updates);
      await this.cache.delete(`card:${cardId}`);
      await this.cache.delete(`board:${card.boardId}:cards`);
      await this.cache.delete(`column:${card.columnId}:cards`);

      const updatedCard = { ...card, ...updates };

      // Add activity for significant changes
      if (data.status && data.status !== card.status) {
        await this.addActivity(cardId, {
          type: 'moved',
          description: `Card moved to ${data.status}`,
          userId,
          userName: 'User',
          metadata: { fromStatus: card.status, toStatus: data.status }
        });
      }

      if (data.assigneeId && data.assigneeId !== card.assigneeId) {
        await this.addActivity(cardId, {
          type: 'assigned',
          description: 'Card assigned',
          userId,
          userName: 'User',
          metadata: { assigneeId: data.assigneeId }
        });
      }

      this.logger.info('Card updated', { cardId, boardId: card.boardId, userId });
      return updatedCard;
    } catch (error) {
      this.logger.error('Error updating card', { error, cardId, userId });
      throw error;
    }
  }

  async moveCard(data: MoveCardRequest, userId: string): Promise<KanbanCard> {
    try {
      const card = await this.getCard(data.cardId);
      if (!card) throw new Error('Card not found');

      const targetColumn = await this.db.collection('kanban_columns').doc(data.targetColumnId).get();
      if (!targetColumn.exists) throw new Error('Target column not found');

      const oldColumnId = card.columnId;
      const newOrder = data.targetOrder || 0;

      // Update card
      await this.db.collection('kanban_cards').doc(data.cardId).update({
        columnId: data.targetColumnId,
        order: newOrder,
        updatedAt: new Date(),
        lastActivityAt: new Date()
      });

      // Reorder cards in both columns
      await this.reorderCardsInColumn(oldColumnId);
      await this.reorderCardsInColumn(data.targetColumnId);

      // Clear caches
      await this.cache.delete(`card:${data.cardId}`);
      await this.cache.delete(`board:${card.boardId}:cards`);
      await this.cache.delete(`column:${oldColumnId}:cards`);
      await this.cache.delete(`column:${data.targetColumnId}:cards`);

      // Add activity
      await this.addActivity(data.cardId, {
        type: 'moved',
        description: 'Card moved to different column',
        userId,
        userName: 'User',
        metadata: { fromColumn: oldColumnId, toColumn: data.targetColumnId }
      });

      const updatedCard = await this.getCard(data.cardId);
      this.logger.info('Card moved', { cardId: data.cardId, fromColumn: oldColumnId, toColumn: data.targetColumnId, userId });
      return updatedCard!;
    } catch (error) {
      this.logger.error('Error moving card', { error, cardId: data.cardId, userId });
      throw error;
    }
  }

  async deleteCard(cardId: string, userId: string): Promise<void> {
    try {
      const card = await this.getCard(cardId);
      if (!card) throw new Error('Card not found');

      // Soft delete
      await this.db.collection('kanban_cards').doc(cardId).update({
        isActive: false,
        status: 'archived',
        updatedAt: new Date()
      });

      await this.cache.delete(`card:${cardId}`);
      await this.cache.delete(`board:${card.boardId}:cards`);
      await this.cache.delete(`column:${card.columnId}:cards`);

      this.logger.info('Card deleted', { cardId, boardId: card.boardId, userId });
    } catch (error) {
      this.logger.error('Error deleting card', { error, cardId, userId });
      throw error;
    }
  }

  // Comment Operations
  async addComment(data: AddCommentRequest, userId: string): Promise<KanbanComment> {
    try {
      const card = await this.getCard(data.cardId);
      if (!card) throw new Error('Card not found');

      const comment: KanbanComment = {
        id: `board_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        cardId: data.cardId,
        content: data.content,
        authorId: userId,
        authorName: 'User', // TODO: Get from user service
        createdAt: new Date(),
        updatedAt: new Date(),
        isEdited: false,
        mentions: data.mentions || []
      };

      await this.db.collection('kanban_comments').doc(comment.id).set(comment);
      await this.cache.delete(`card:${data.cardId}`);

      // Add activity
      await this.addActivity(data.cardId, {
        type: 'commented',
        description: 'Comment added',
        userId,
        userName: 'User',
        metadata: { commentId: comment.id }
      });

      this.logger.info('Comment added', { commentId: comment.id, cardId: data.cardId, userId });
      return comment;
    } catch (error) {
      this.logger.error('Error adding comment', { error, cardId: data.cardId, userId });
      throw error;
    }
  }

  async updateComment(data: UpdateCommentRequest, userId: string): Promise<KanbanComment> {
    try {
      const commentDoc = await this.db.collection('kanban_comments').doc(data.commentId).get();
      if (!commentDoc.exists) throw new Error('Comment not found');

      const comment = commentDoc.data() as KanbanComment;
      if (comment.authorId !== userId) throw new Error('Unauthorized');

      const updates = {
        content: data.content,
        mentions: data.mentions || [],
        updatedAt: new Date(),
        isEdited: true
      };

      await this.db.collection('kanban_comments').doc(data.commentId).update(updates);
      await this.cache.delete(`card:${comment.cardId}`);

      const updatedComment = { ...comment, ...updates };
      this.logger.info('Comment updated', { commentId: data.commentId, cardId: comment.cardId, userId });
      return updatedComment;
    } catch (error) {
      this.logger.error('Error updating comment', { error, commentId: data.commentId, userId });
      throw error;
    }
  }

  // Statistics
  async getBoardStats(boardId: string): Promise<KanbanStats> {
    try {
      const cached = await this.cache.get(`board:${boardId}:stats`);
      if (cached) return JSON.parse(cached) as KanbanStats;

      const cards = await this.getCards(boardId, { includeArchived: true });
      
      const stats: KanbanStats = {
        boardId,
        totalCards: cards.length,
        cardsByStatus: {},
        cardsByPriority: {},
        cardsByAssignee: {},
        averageCompletionTime: 0,
        overdueCards: 0,
        completedThisWeek: 0,
        completedThisMonth: 0,
        lastUpdated: new Date()
      };

      // Calculate statistics
      cards.forEach(card => {
        // Status counts
        stats.cardsByStatus[card.status] = (stats.cardsByStatus[card.status] || 0) + 1;
        
        // Priority counts
        stats.cardsByPriority[card.priority] = (stats.cardsByPriority[card.priority] || 0) + 1;
        
        // Assignee counts
        if (card.assigneeId) {
          stats.cardsByAssignee[card.assigneeId] = (stats.cardsByAssignee[card.assigneeId] || 0) + 1;
        }

        // Overdue cards
        if (card.dueDate && card.dueDate < new Date() && card.status !== 'done') {
          stats.overdueCards++;
        }

        // Completed this week/month
        if (card.status === 'done' && card.updatedAt) {
          const now = new Date();
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

          if (card.updatedAt >= weekAgo) stats.completedThisWeek++;
          if (card.updatedAt >= monthAgo) stats.completedThisMonth++;
        }
      });

      await this.cache.set(`board:${boardId}:stats`, JSON.stringify(stats), 1800);
      return stats;
    } catch (error) {
      this.logger.error('Error getting board stats', { error, boardId });
      throw error;
    }
  }

  // Helper methods
  private async getLastCardInColumn(columnId: string): Promise<KanbanCard | null> {
    try {
      const snapshot = await this.db.collection('kanban_cards')
        .where('columnId', '==', columnId)
        .where('isActive', '==', true)
        .orderBy('order', 'desc')
        .limit(1)
        .get();

      return snapshot.docs.length > 0 ? snapshot.docs[0].data() as KanbanCard : null;
    } catch (error) {
      this.logger.error('Error getting last card in column', { error, columnId });
      return null;
    }
  }

  private async reorderCardsInColumn(columnId: string): Promise<void> {
    try {
      const cards = await this.getCardsByColumn(columnId);
      const batch = this.db.batch();

      cards.forEach((card, index) => {
        if (card.order !== index) {
          const ref = this.db.collection('kanban_cards').doc(card.id);
          batch.update(ref, { order: index });
        }
      });

      await batch.commit();
    } catch (error) {
      this.logger.error('Error reordering cards in column', { error, columnId });
      throw error;
    }
  }

  private async addActivity(cardId: string, activity: Omit<KanbanActivity, 'id' | 'cardId' | 'createdAt'>): Promise<void> {
    try {
      const newActivity: KanbanActivity = {
        id: `board_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        cardId,
        ...activity,
        createdAt: new Date()
      };

      await this.db.collection('kanban_activities').doc(newActivity.id).set(newActivity);
    } catch (error) {
      this.logger.error('Error adding activity', { error, cardId });
    }
  }

  private applyFilters(cards: KanbanCard[], filter: KanbanFilter): KanbanCard[] {
    return cards.filter(card => {
      if (filter.status && filter.status.length > 0 && !filter.status.includes(card.status)) {
        return false;
      }
      if (filter.priority && filter.priority.length > 0 && !filter.priority.includes(card.priority)) {
        return false;
      }
      if (filter.assignee && filter.assignee.length > 0 && (!card.assigneeId || !filter.assignee.includes(card.assigneeId))) {
        return false;
      }
      if (filter.tags && filter.tags.length > 0 && !filter.tags.some(tag => card.tags.includes(tag))) {
        return false;
      }
      if (filter.dueDate) {
        if (filter.dueDate.from && card.dueDate && card.dueDate < filter.dueDate.from) {
          return false;
        }
        if (filter.dueDate.to && card.dueDate && card.dueDate > filter.dueDate.to) {
          return false;
        }
      }
      if (filter.createdDate) {
        if (filter.createdDate.from && card.createdAt < filter.createdDate.from) {
          return false;
        }
        if (filter.createdDate.to && card.createdAt > filter.createdDate.to) {
          return false;
        }
      }
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        const matchesTitle = card.title.toLowerCase().includes(searchLower);
        const matchesDescription = card.description?.toLowerCase().includes(searchLower) || false;
        const matchesTags = card.tags.some(tag => tag.toLowerCase().includes(searchLower));
        if (!matchesTitle && !matchesDescription && !matchesTags) {
          return false;
        }
      }
      return true;
    });
  }

  private applySorting(cards: KanbanCard[], sort: KanbanSort): KanbanCard[] {
    return cards.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sort.field) {
        case 'title':
          aValue = a.title.toLowerCase();
          bValue = b.title.toLowerCase();
          break;
        case 'priority':
          const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
          aValue = priorityOrder[a.priority as keyof typeof priorityOrder] || 0;
          bValue = priorityOrder[b.priority as keyof typeof priorityOrder] || 0;
          break;
        case 'dueDate':
          aValue = a.dueDate || new Date(9999, 11, 31);
          bValue = b.dueDate || new Date(9999, 11, 31);
          break;
        case 'createdAt':
          aValue = a.createdAt;
          bValue = b.createdAt;
          break;
        case 'updatedAt':
          aValue = a.updatedAt;
          bValue = b.updatedAt;
          break;
        case 'assignee':
          aValue = a.assigneeName || '';
          bValue = b.assigneeName || '';
          break;
        default:
          return 0;
      }

      if (sort.direction === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });
  }

  // Column reordering
  async reorderColumns(boardId: string, columnIds: string[]): Promise<void> {
    try {
      for (let i = 0; i < columnIds.length; i++) {
        await this.db.collection('kanban_columns')
          .doc(columnIds[i])
          .update({ position: i });
      }
    } catch (error) {
      this.logger.error('Error reordering columns', { error, boardId, columnIds });
      throw new Error('Failed to reorder columns');
    }
  }

  // Card reordering
  async reorderCards(columnId: string, cardIds: string[]): Promise<void> {
    try {
      for (let i = 0; i < cardIds.length; i++) {
        await this.db.collection('kanban_cards')
          .doc(cardIds[i])
          .update({ position: i });
      }
    } catch (error) {
      this.logger.error('Error reordering cards', { error, columnId, cardIds });
      throw new Error('Failed to reorder cards');
    }
  }

  // Comment deletion
  async deleteComment(commentId: string): Promise<void> {
    try {
      await this.db.collection('kanban_comments').doc(commentId).delete();
    } catch (error) {
      this.logger.error('Error deleting comment', { error, commentId });
      throw new Error('Failed to delete comment');
    }
  }

  // Card search
  async searchCards(userId: string, query: string, filters?: any): Promise<KanbanCard[]> {
    try {
      // Implement search logic here
      const cards = await this.db.collection('kanban_cards')
        .where('userId', '==', userId)
        .where('title', '>=', query)
        .where('title', '<=', query + '\uf8ff')
        .get();

      return cards.docs.map(doc => ({ id: doc.id, ...doc.data() } as KanbanCard));
    } catch (error) {
      this.logger.error('Error searching cards', { error, userId, query });
      throw new Error('Failed to search cards');
    }
  }

  // Column statistics
  async getColumnStats(columnId: string): Promise<any> {
    try {
      const cards = await this.db.collection('kanban_cards')
        .where('columnId', '==', columnId)
        .get();

      return {
        totalCards: cards.docs.length,
        completedCards: cards.docs.filter(doc => doc.data().status === 'completed').length,
      };
    } catch (error) {
      this.logger.error('Error getting column stats', { error, columnId });
      throw new Error('Failed to get column stats');
    }
  }

  // Card activity
  async getCardActivity(cardId: string): Promise<KanbanActivity[]> {
    try {
      const activities = await this.db.collection('kanban_activities')
        .where('cardId', '==', cardId)
        .orderBy('createdAt', 'desc')
        .get();

      return activities.docs.map(doc => ({ id: doc.id, ...doc.data() } as KanbanActivity));
    } catch (error) {
      this.logger.error('Error getting card activity', { error, cardId });
      throw new Error('Failed to get card activity');
    }
  }

  // Board activity
  async getBoardActivity(boardId: string): Promise<KanbanActivity[]> {
    try {
      const activities = await this.db.collection('kanban_activities')
        .where('boardId', '==', boardId)
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get();

      return activities.docs.map(doc => ({ id: doc.id, ...doc.data() } as KanbanActivity));
    } catch (error) {
      this.logger.error('Error getting board activity', { error, boardId });
      throw new Error('Failed to get board activity');
    }
  }
} 