import { Job } from 'bull';
import { kanbanService } from '../core/services/kanbanService';
import { logger } from '../core/services/logger';
import { 
  KanbanActivity, 
  KanbanCard, 
  KanbanBoard, 
  KanbanColumn,
  KanbanComment 
} from '../shared/types/kanban';

export interface KanbanJobData {
  type: 'activity' | 'stats' | 'notification' | 'cleanup' | 'backup';
  payload: any;
  userId: string;
  boardId?: string;
  cardId?: string;
  columnId?: string;
}

export class KanbanWorker {
  async processJob(job: Job<KanbanJobData>) {
    const { type, payload, userId, boardId, cardId, columnId } = job.data;
    
    try {
      switch (type) {
        case 'activity':
          await this.processActivityJob(payload, userId, boardId, cardId, columnId);
          break;
        case 'stats':
          await this.processStatsJob(payload, userId, boardId);
          break;
        case 'notification':
          await this.processNotificationJob(payload, userId, boardId, cardId);
          break;
        case 'cleanup':
          await this.processCleanupJob(payload, userId, boardId);
          break;
        case 'backup':
          await this.processBackupJob(payload, userId, boardId);
          break;
        default:
          throw new Error(`Unknown job type: ${type}`);
      }
      
      logger.info(`Kanban job completed`, { type, userId, boardId, cardId, columnId });
    } catch (error) {
      logger.error(`Kanban job failed`, { type, userId, boardId, cardId, columnId, error });
      throw error;
    }
  }

  private async processActivityJob(
    payload: any, 
    userId: string, 
    boardId?: string, 
    cardId?: string, 
    columnId?: string
  ) {
    const { action, details, metadata } = payload;
    
    if (!boardId) {
      throw new Error('Board ID is required for activity logging');
    }

    const activity: Omit<KanbanActivity, 'id' | 'createdAt'> = {
      userId,
      boardId,
      cardId,
      columnId,
      action,
      details,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString(),
        userAgent: metadata?.userAgent || 'system'
      }
    };

    await kanbanService.logActivity(activity);
    
    // Update board's last activity timestamp
    await kanbanService.updateBoardLastActivity(boardId, userId);
  }

  private async processStatsJob(payload: any, userId: string, boardId?: string) {
    const { operation, data } = payload;
    
    if (!boardId) {
      throw new Error('Board ID is required for stats processing');
    }

    switch (operation) {
      case 'updateBoardStats':
        await this.updateBoardStats(boardId, userId);
        break;
      case 'updateColumnStats':
        if (data.columnId) {
          await this.updateColumnStats(boardId, data.columnId, userId);
        }
        break;
      case 'updateCardStats':
        if (data.cardId) {
          await this.updateCardStats(boardId, data.cardId, userId);
        }
        break;
      case 'generateDailyReport':
        await this.generateDailyReport(boardId, userId);
        break;
      default:
        logger.warn(`Unknown stats operation: ${operation}`);
    }
  }

  private async processNotificationJob(
    payload: any, 
    userId: string, 
    boardId?: string, 
    cardId?: string
  ) {
    const { type, recipients, message, metadata } = payload;
    
    // This would integrate with a notification service
    logger.info('Processing notification', { 
      type, 
      recipients, 
      message, 
      userId, 
      boardId, 
      cardId,
      metadata 
    });
    
    // Example notification types:
    switch (type) {
      case 'cardDueDate':
        await this.sendDueDateNotification(recipients, message, cardId, boardId);
        break;
      case 'cardAssigned':
        await this.sendAssignmentNotification(recipients, message, cardId, boardId);
        break;
      case 'cardMoved':
        await this.sendCardMovedNotification(recipients, message, cardId, boardId);
        break;
      case 'commentAdded':
        await this.sendCommentNotification(recipients, message, cardId, boardId);
        break;
      case 'boardShared':
        await this.sendBoardSharedNotification(recipients, message, boardId);
        break;
      default:
        logger.warn(`Unknown notification type: ${type}`);
    }
  }

  private async processCleanupJob(payload: any, userId: string, boardId?: string) {
    const { operation, criteria } = payload;
    
    switch (operation) {
      case 'archiveOldCards':
        await this.archiveOldCards(boardId, userId, criteria);
        break;
      case 'deleteOldActivities':
        await this.deleteOldActivities(boardId, userId, criteria);
        break;
      case 'cleanupEmptyColumns':
        await this.cleanupEmptyColumns(boardId, userId);
        break;
      case 'optimizeBoard':
        await this.optimizeBoard(boardId, userId);
        break;
      default:
        logger.warn(`Unknown cleanup operation: ${operation}`);
    }
  }

  private async processBackupJob(payload: any, userId: string, boardId?: string) {
    const { operation, destination } = payload;
    
    switch (operation) {
      case 'backupBoard':
        if (boardId) {
          await this.backupBoard(boardId, userId, destination);
        }
        break;
      case 'backupAllBoards':
        await this.backupAllUserBoards(userId, destination);
        break;
      case 'exportBoard':
        if (boardId) {
          await this.exportBoard(boardId, userId, destination);
        }
        break;
      default:
        logger.warn(`Unknown backup operation: ${operation}`);
    }
  }

  // Helper methods for stats processing
  private async updateBoardStats(boardId: string, userId: string) {
    try {
      const board = await kanbanService.getBoard(boardId, userId);
      if (!board) return;

      const stats = await kanbanService.getBoardStats(boardId, userId);
      if (stats) {
        // Update cached stats or trigger UI updates
        logger.info('Board stats updated', { boardId, stats });
      }
    } catch (error) {
      logger.error('Error updating board stats', { boardId, userId, error });
    }
  }

  private async updateColumnStats(boardId: string, columnId: string, userId: string) {
    try {
      const stats = await kanbanService.getColumnStats(boardId, columnId, userId);
      if (stats) {
        logger.info('Column stats updated', { boardId, columnId, stats });
      }
    } catch (error) {
      logger.error('Error updating column stats', { boardId, columnId, userId, error });
    }
  }

  private async updateCardStats(boardId: string, cardId: string, userId: string) {
    try {
      const card = await kanbanService.getCard(boardId, cardId, userId);
      if (card) {
        // Calculate card-specific metrics
        const metrics = {
          timeInColumn: this.calculateTimeInColumn(card),
          commentsCount: card.comments?.length || 0,
          lastActivity: card.updatedAt
        };
        
        logger.info('Card stats updated', { boardId, cardId, metrics });
      }
    } catch (error) {
      logger.error('Error updating card stats', { boardId, cardId, userId, error });
    }
  }

  private async generateDailyReport(boardId: string, userId: string) {
    try {
      const board = await kanbanService.getBoard(boardId, userId);
      if (!board) return;

      const stats = await kanbanService.getBoardStats(boardId, userId);
      const activities = await kanbanService.getBoardActivity(boardId, userId, 50);
      
      const report = {
        boardId,
        boardName: board.name,
        date: new Date().toISOString().split('T')[0],
        stats,
        recentActivities: activities?.slice(0, 10),
        summary: {
          cardsCreated: activities?.filter(a => a.action === 'card_created').length || 0,
          cardsCompleted: activities?.filter(a => a.action === 'card_moved' && 
            a.details?.includes('completed')).length || 0,
          commentsAdded: activities?.filter(a => a.action === 'comment_added').length || 0
        }
      };
      
      logger.info('Daily report generated', { boardId, report });
    } catch (error) {
      logger.error('Error generating daily report', { boardId, userId, error });
    }
  }

  // Helper methods for notifications
  private async sendDueDateNotification(recipients: string[], message: string, cardId?: string, boardId?: string) {
    // Implementation would integrate with email/SMS/push notification service
    logger.info('Due date notification sent', { recipients, message, cardId, boardId });
  }

  private async sendAssignmentNotification(recipients: string[], message: string, cardId?: string, boardId?: string) {
    logger.info('Assignment notification sent', { recipients, message, cardId, boardId });
  }

  private async sendCardMovedNotification(recipients: string[], message: string, cardId?: string, boardId?: string) {
    logger.info('Card moved notification sent', { recipients, message, cardId, boardId });
  }

  private async sendCommentNotification(recipients: string[], message: string, cardId?: string, boardId?: string) {
    logger.info('Comment notification sent', { recipients, message, cardId, boardId });
  }

  private async sendBoardSharedNotification(recipients: string[], message: string, boardId?: string) {
    logger.info('Board shared notification sent', { recipients, message, boardId });
  }

  // Helper methods for cleanup
  private async archiveOldCards(boardId: string | undefined, userId: string, criteria: any) {
    if (!boardId) return;
    
    const { olderThanDays, completedOnly } = criteria;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    logger.info('Archiving old cards', { boardId, userId, criteria, cutoffDate });
    // Implementation would move cards to archived status
  }

  private async deleteOldActivities(boardId: string | undefined, userId: string, criteria: any) {
    if (!boardId) return;
    
    const { olderThanDays } = criteria;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    logger.info('Deleting old activities', { boardId, userId, criteria, cutoffDate });
    // Implementation would delete activities older than cutoff date
  }

  private async cleanupEmptyColumns(boardId: string | undefined, userId: string) {
    if (!boardId) return;
    
    logger.info('Cleaning up empty columns', { boardId, userId });
    // Implementation would remove columns with no cards (if allowed)
  }

  private async optimizeBoard(boardId: string | undefined, userId: string) {
    if (!boardId) return;
    
    logger.info('Optimizing board', { boardId, userId });
    // Implementation would optimize board structure and performance
  }

  // Helper methods for backup
  private async backupBoard(boardId: string, userId: string, destination: string) {
    try {
      const board = await kanbanService.getBoard(boardId, userId);
      if (!board) return;

      const backup = {
        board,
        timestamp: new Date().toISOString(),
        version: '1.0'
      };
      
      logger.info('Board backup created', { boardId, userId, destination, backup });
      // Implementation would save backup to specified destination
    } catch (error) {
      logger.error('Error backing up board', { boardId, userId, destination, error });
    }
  }

  private async backupAllUserBoards(userId: string, destination: string) {
    try {
      const boards = await kanbanService.getUserBoards(userId);
      
      for (const board of boards) {
        await this.backupBoard(board.id, userId, destination);
      }
      
      logger.info('All user boards backed up', { userId, destination, count: boards.length });
    } catch (error) {
      logger.error('Error backing up all user boards', { userId, destination, error });
    }
  }

  private async exportBoard(boardId: string, userId: string, destination: string) {
    try {
      const board = await kanbanService.getBoard(boardId, userId);
      if (!board) return;

      const exportData = {
        board,
        exportedAt: new Date().toISOString(),
        format: 'json'
      };
      
      logger.info('Board exported', { boardId, userId, destination, exportData });
      // Implementation would export board in specified format
    } catch (error) {
      logger.error('Error exporting board', { boardId, userId, destination, error });
    }
  }

  // Utility methods
  private calculateTimeInColumn(card: KanbanCard): number {
    // Calculate time spent in current column
    const now = new Date();
    const lastMoved = card.updatedAt ? new Date(card.updatedAt) : new Date(card.createdAt);
    return Math.floor((now.getTime() - lastMoved.getTime()) / (1000 * 60 * 60)); // hours
  }
}

export const kanbanWorker = new KanbanWorker(); 