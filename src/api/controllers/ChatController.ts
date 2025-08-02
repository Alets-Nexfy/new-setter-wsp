import { Request, Response } from 'express';
import { LoggerService } from '@/core/services/LoggerService';
import { SupabaseService } from '@/core/services/SupabaseService';
import { 
  Chat,
  ChatListItem,
  GetChatsRequest,
  UpdateContactNameRequest,
  ChatActivationRequest,
  ChatDeactivationRequest,
  BulkChatOperation,
  ChatFilters,
  ChatSortOptions
} from '@/shared/types/chat';

export class ChatController {
  private logger: LoggerService;
  private db: SupabaseService;

  constructor() {
    this.logger = LoggerService.getInstance();
    this.db = SupabaseService.getInstance();
  }

  /**
   * MIGRADO DE: whatsapp-api/src/server.js líneas 2392-2454
   * GET /api/v2/chats/:userId
   * MEJORAS: TypeScript, pagination, filtros, structured response
   */
  public async getChats(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { 
        limit = 50, 
        offset = 0, 
        search,
        isActivated,
        hasKanbanBoard,
        sortBy = 'lastMessageTimestamp',
        sortOrder = 'desc'
      } = req.query;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'User ID is required',
        });
        return;
      }

      this.logger.info('Get chats request', { 
        userId, 
        limit: Number(limit), 
        offset: Number(offset), 
        search,
        isActivated,
        hasKanbanBoard 
      });

      // Verify user exists
      const userDoc = await this.db.doc('users', userId).get();
      if (!userDoc.exists) {
        res.status(404).json({
          success: false,
          error: 'User not found',
        });
        return;
      }

      // Build query
      let query = this.db
        .collection('users')
        .doc(userId)
        .collection('chats');

      // Apply filters
      if (isActivated !== undefined) {
        query = query.where('isActivated', '==', isActivated === 'true');
      }

      if (hasKanbanBoard !== undefined) {
        if (hasKanbanBoard === 'true') {
          query = query.where('kanbanBoardId', '!=', null);
        } else {
          query = query.where('kanbanBoardId', '==', null);
        }
      }

      // Apply sorting
      const validSortFields = ['lastMessageTimestamp', 'contactName', 'createdAt', 'lastActivityTimestamp'];
      const sortField = validSortFields.includes(sortBy as string) ? sortBy as string : 'lastMessageTimestamp';
      const sortDirection = sortOrder === 'asc' ? 'asc' : 'desc';
      
      query = query.orderBy(sortField, sortDirection);

      // Apply pagination
      if (offset && Number(offset) > 0) {
        const offsetSnapshot = await query.limit(Number(offset)).get();
        if (!offsetSnapshot.empty) {
          const lastDoc = offsetSnapshot.docs[offsetSnapshot.docs.length - 1];
          query = query.startAfter(lastDoc);
        }
      }

      query = query.limit(Number(limit));

      // Execute query
      const chatsSnapshot = await query.get();
      
      const chats: ChatListItem[] = [];
      for (const doc of chatsSnapshot.docs) {
        const data = doc.data();
        const chatId = doc.id;

        // Apply text search filter (post-query since Firestore doesn't support full-text search)
        if (search) {
          const searchLower = search.toString().toLowerCase();
          const contactName = (data.contactDisplayName || data.contactName || '').toLowerCase();
          const lastMessage = (data.lastMessageContent || '').toLowerCase();
          
          if (!contactName.includes(searchLower) && !lastMessage.includes(searchLower)) {
            continue;
          }
        }

        const lastMessageTimestamp = data.lastMessageTimestamp?.toDate
          ? data.lastMessageTimestamp.toDate().toISOString()
          : data.lastMessageTimestamp || '';

        chats.push({
          chatId,
          contactName: data.contactDisplayName || data.contactName || chatId,
          contactDisplayName: data.contactDisplayName || null,
          lastMessageContent: data.lastMessageContent || '',
          lastMessageTimestamp,
          lastMessageType: data.lastMessageType || 'text',
          lastMessageOrigin: data.lastMessageOrigin || 'contact',
          isActivated: data.isActivated || false,
          userIsActive: data.userIsActive || false,
          unreadCount: data.unreadCount || 0,
          kanbanBoardId: data.kanbanBoardId || null,
          kanbanColumnId: data.kanbanColumnId || null
        });
      }

      // Get total count for pagination (this could be cached for performance)
      const totalQuery = this.db
        .collection('users')
        .doc(userId)
        .collection('chats');
      
      const totalSnapshot = await totalQuery.count().get();
      const total = totalSnapshot.data().count;

      res.json({
        success: true,
        data: chats,
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
          total,
          hasMore: chats.length === Number(limit)
        }
      });

    } catch (error) {
      this.logger.error('Error getting chats', {
        userId: req.params.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get chats',
      });
    }
  }

  /**
   * GET /api/v2/chats/:userId/:chatId
   * Get specific chat details
   */
  public async getChat(req: Request, res: Response): Promise<void> {
    try {
      const { userId, chatId } = req.params;

      if (!userId || !chatId) {
        res.status(400).json({
          success: false,
          error: 'User ID and Chat ID are required',
        });
        return;
      }

      this.logger.debug('Get chat request', { userId, chatId });

      const chatDoc = await this.db
        .collection('users')
        .doc(userId)
        .collection('chats')
        .doc(chatId)
        .get();

      if (!chatDoc.exists) {
        res.status(404).json({
          success: false,
          error: 'Chat not found',
        });
        return;
      }

      const data = chatDoc.data()!;
      
      // Convert timestamps
      const chat = {
        ...data,
        id: chatDoc.id,
        chatId: chatDoc.id,
        createdAt: data.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() ? data.updatedAt.toDate().toISOString() : data.updatedAt,
        lastMessageTimestamp: data.lastMessageTimestamp?.toDate?.() ? data.lastMessageTimestamp.toDate().toISOString() : data.lastMessageTimestamp,
        lastActivityTimestamp: data.lastActivityTimestamp?.toDate?.() ? data.lastActivityTimestamp.toDate().toISOString() : data.lastActivityTimestamp,
        lastHumanMessageTimestamp: data.lastHumanMessageTimestamp?.toDate?.() ? data.lastHumanMessageTimestamp.toDate().toISOString() : data.lastHumanMessageTimestamp,
        lastBotMessageTimestamp: data.lastBotMessageTimestamp?.toDate?.() ? data.lastBotMessageTimestamp.toDate().toISOString() : data.lastBotMessageTimestamp,
        lastContactMessageTimestamp: data.lastContactMessageTimestamp?.toDate?.() ? data.lastContactMessageTimestamp.toDate().toISOString() : data.lastContactMessageTimestamp
      };

      res.json({
        success: true,
        data: chat
      });

    } catch (error) {
      this.logger.error('Error getting chat', {
        userId: req.params.userId,
        chatId: req.params.chatId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get chat',
      });
    }
  }

  /**
   * MIGRADO DE: whatsapp-api/src/server.js líneas 2734-2790
   * PUT /api/v2/chats/:userId/:chatId/contact-name
   * MEJORAS: TypeScript, validation, structured response
   */
  public async updateContactName(req: Request, res: Response): Promise<void> {
    try {
      const { userId, chatId } = req.params;
      const { name }: UpdateContactNameRequest = req.body;

      if (!userId || !chatId) {
        res.status(400).json({
          success: false,
          error: 'User ID and Chat ID are required',
        });
        return;
      }

      if (name === undefined || typeof name !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Name field (string) is required in body',
        });
        return;
      }

      this.logger.info('Update contact name request', { 
        userId, 
        chatId, 
        name: name.trim() 
      });

      const chatDocRef = this.db
        .collection('users')
        .doc(userId)
        .collection('chats')
        .doc(chatId);

      // Verify chat exists
      const chatDoc = await chatDocRef.get();
      if (!chatDoc.exists) {
        res.status(404).json({
          success: false,
          error: 'Chat not found',
        });
        return;
      }

      // Update contact display name
      await chatDocRef.update({
        contactDisplayName: name.trim(),
        updatedAt: new Date().toISOString()
      });

      this.logger.info('Contact display name updated', {
        userId,
        chatId,
        newName: name.trim()
      });

      res.json({
        success: true,
        message: 'Contact name updated successfully',
        data: {
          chatId,
          contactDisplayName: name.trim()
        }
      });

    } catch (error) {
      this.logger.error('Error updating contact name', {
        userId: req.params.userId,
        chatId: req.params.chatId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to update contact name',
      });
    }
  }

  /**
   * POST /api/v2/chats/:userId/:chatId/activate
   * Activate chat for bot responses
   */
  public async activateChat(req: Request, res: Response): Promise<void> {
    try {
      const { userId, chatId } = req.params;
      const { method = 'manual', metadata = {} }: ChatActivationRequest = req.body;

      if (!userId || !chatId) {
        res.status(400).json({
          success: false,
          error: 'User ID and Chat ID are required',
        });
        return;
      }

      this.logger.info('Activate chat request', { 
        userId, 
        chatId, 
        method 
      });

      const chatDocRef = this.db
        .collection('users')
        .doc(userId)
        .collection('chats')
        .doc(chatId);

      // Verify chat exists, create if it doesn't
      const chatDoc = await chatDocRef.get();
      if (!chatDoc.exists) {
        // Create chat document
        await chatDocRef.set({
          userId,
          chatId,
          contactName: chatId, // Default to chatId
          type: 'individual',
          isActivated: true,
          activatedAt: new Date().toISOString(),
          activationMethod: method,
          userIsActive: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...metadata
        });

        // Ensure message collections exist
        await this.ensureChatCollections(userId, chatId);
      } else {
        // Update existing chat
        await chatDocRef.update({
          isActivated: true,
          activatedAt: new Date().toISOString(),
          activationMethod: method,
          updatedAt: new Date().toISOString(),
          ...metadata
        });
      }

      // Log chat activity
      await this.logChatActivity(userId, chatId, 'activated', `Chat activated via ${method}`, {
        method,
        ...metadata
      });

      this.logger.info('Chat activated successfully', {
        userId,
        chatId,
        method
      });

      res.json({
        success: true,
        message: 'Chat activated successfully',
        data: {
          chatId,
          isActivated: true,
          activationMethod: method,
          activatedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      this.logger.error('Error activating chat', {
        userId: req.params.userId,
        chatId: req.params.chatId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to activate chat',
      });
    }
  }

  /**
   * POST /api/v2/chats/:userId/:chatId/deactivate
   * Deactivate chat to stop bot responses
   */
  public async deactivateChat(req: Request, res: Response): Promise<void> {
    try {
      const { userId, chatId } = req.params;
      const { reason = 'manual', sendFarewellMessage = false }: ChatDeactivationRequest = req.body;

      if (!userId || !chatId) {
        res.status(400).json({
          success: false,
          error: 'User ID and Chat ID are required',
        });
        return;
      }

      this.logger.info('Deactivate chat request', { 
        userId, 
        chatId, 
        reason,
        sendFarewellMessage 
      });

      const chatDocRef = this.db
        .collection('users')
        .doc(userId)
        .collection('chats')
        .doc(chatId);

      // Verify chat exists
      const chatDoc = await chatDocRef.get();
      if (!chatDoc.exists) {
        res.status(404).json({
          success: false,
          error: 'Chat not found',
        });
        return;
      }

      // Update chat
      await chatDocRef.update({
        isActivated: false,
        deactivatedAt: new Date().toISOString(),
        deactivationReason: reason,
        updatedAt: new Date().toISOString()
      });

      // Log chat activity
      await this.logChatActivity(userId, chatId, 'deactivated', `Chat deactivated: ${reason}`, {
        reason,
        sendFarewellMessage
      });

      // TODO: Send farewell message if requested
      if (sendFarewellMessage) {
        // This would integrate with the MessageController/Service
        this.logger.debug('Farewell message requested', { userId, chatId });
      }

      this.logger.info('Chat deactivated successfully', {
        userId,
        chatId,
        reason
      });

      res.json({
        success: true,
        message: 'Chat deactivated successfully',
        data: {
          chatId,
          isActivated: false,
          deactivationReason: reason,
          deactivatedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      this.logger.error('Error deactivating chat', {
        userId: req.params.userId,
        chatId: req.params.chatId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to deactivate chat',
      });
    }
  }

  /**
   * MIGRADO DE: whatsapp-api/src/server.js líneas 4443-4512
   * POST /api/v2/chats/:userId/reset-activations
   * MEJORAS: TypeScript, batching, error handling
   */
  public async resetChatActivations(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'User ID is required',
        });
        return;
      }

      this.logger.info('Reset chat activations request', { userId });

      // Get all chats for the user
      const chatsSnapshot = await this.db
        .collection('users')
        .doc(userId)
        .collection('chats')
        .get();

      if (chatsSnapshot.empty) {
        res.json({
          success: true,
          message: 'No chats found to reset',
          data: {
            count: 0,
            batches: 0
          }
        });
        return;
      }

      // Process in batches (Firestore limit: 500 operations per batch)
      const batches = [];
      let currentBatch = this.db.batch();
      let operationCount = 0;
      let batchCount = 0;

      chatsSnapshot.forEach(doc => {
        const chatRef = this.db
          .collection('users')
          .doc(userId)
          .collection('chats')
          .doc(doc.id);
        
        currentBatch.update(chatRef, { 
          isActivated: false,
          deactivatedAt: new Date().toISOString(),
          deactivationReason: 'bulk_reset',
          updatedAt: new Date().toISOString()
        });
        
        operationCount++;

        // Create new batch if limit reached
        if (operationCount >= 499) {
          batches.push(currentBatch);
          currentBatch = this.db.batch();
          operationCount = 0;
          batchCount++;
        }
      });

      // Add the last batch if it has operations
      if (operationCount > 0) {
        batches.push(currentBatch);
        batchCount++;
      }

      // Execute all batches
      const batchPromises = batches.map(batch => batch.commit());
      await Promise.all(batchPromises);

      // Log bulk activity
      await this.logChatActivity(userId, 'bulk', 'deactivated', `Bulk reset: ${chatsSnapshot.size} chats deactivated`, {
        operation: 'bulk_reset',
        count: chatsSnapshot.size,
        batches: batchCount
      });

      this.logger.info('Chat activations reset successfully', {
        userId,
        count: chatsSnapshot.size,
        batches: batchCount
      });

      res.json({
        success: true,
        message: `Successfully reset ${chatsSnapshot.size} chats`,
        data: {
          count: chatsSnapshot.size,
          batches: batchCount
        }
      });

    } catch (error) {
      this.logger.error('Error resetting chat activations', {
        userId: req.params.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to reset chat activations',
      });
    }
  }

  /**
   * POST /api/v2/chats/:userId/bulk-operation
   * Perform bulk operations on multiple chats
   */
  public async bulkOperation(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { operation, chatIds, parameters = {} }: BulkChatOperation = req.body;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'User ID is required',
        });
        return;
      }

      if (!operation || !chatIds || !Array.isArray(chatIds) || chatIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Operation and chat IDs array are required',
        });
        return;
      }

      this.logger.info('Bulk chat operation request', {
        userId,
        operation,
        chatCount: chatIds.length,
        parameters
      });

      const results = [];
      let successCount = 0;
      let failCount = 0;

      // Process each chat
      for (const chatId of chatIds) {
        try {
          const chatDocRef = this.db
            .collection('users')
            .doc(userId)
            .collection('chats')
            .doc(chatId);

          switch (operation) {
            case 'activate':
              await chatDocRef.update({
                isActivated: true,
                activatedAt: new Date().toISOString(),
                activationMethod: 'bulk',
                updatedAt: new Date().toISOString(),
                ...parameters
              });
              break;

            case 'deactivate':
              await chatDocRef.update({
                isActivated: false,
                deactivatedAt: new Date().toISOString(),
                deactivationReason: 'bulk_operation',
                updatedAt: new Date().toISOString(),
                ...parameters
              });
              break;

            case 'move_to_kanban':
              if (!parameters.kanbanBoardId) {
                throw new Error('kanbanBoardId required for move_to_kanban operation');
              }
              await chatDocRef.update({
                kanbanBoardId: parameters.kanbanBoardId,
                kanbanColumnId: parameters.kanbanColumnId || null,
                updatedAt: new Date().toISOString()
              });
              break;

            case 'clear_history':
              // Clear message collections
              await this.clearChatHistory(userId, chatId);
              await chatDocRef.update({
                historyClearedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              });
              break;

            case 'delete':
              // Delete chat and all subcollections
              await this.deleteChatCompletely(userId, chatId);
              break;

            default:
              throw new Error(`Unknown operation: ${operation}`);
          }

          results.push({
            chatId,
            success: true
          });
          successCount++;

        } catch (error) {
          results.push({
            chatId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          failCount++;
        }
      }

      // Log bulk activity
      await this.logChatActivity(userId, 'bulk', operation, `Bulk ${operation}: ${successCount}/${chatIds.length} successful`, {
        operation,
        total: chatIds.length,
        successful: successCount,
        failed: failCount,
        parameters
      });

      this.logger.info('Bulk operation completed', {
        userId,
        operation,
        total: chatIds.length,
        successful: successCount,
        failed: failCount
      });

      res.json({
        success: true,
        message: `Bulk ${operation} completed`,
        data: {
          results,
          summary: {
            total: chatIds.length,
            successful: successCount,
            failed: failCount
          }
        }
      });

    } catch (error) {
      this.logger.error('Error in bulk operation', {
        userId: req.params.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to perform bulk operation',
      });
    }
  }

  /**
   * GET /api/v2/chats/:userId/statistics
   * Get chat statistics for user
   */
  public async getStatistics(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'User ID is required',
        });
        return;
      }

      this.logger.debug('Get chat statistics request', { userId });

      // Get chat counts
      const [
        totalChatsSnapshot,
        activatedChatsSnapshot,
        activeUsersSnapshot,
        chatsWithKanbanSnapshot
      ] = await Promise.all([
        this.db.collection('users').doc(userId).collection('chats').count().get(),
        this.db.collection('users').doc(userId).collection('chats').where('isActivated', '==', true).count().get(),
        this.db.collection('users').doc(userId).collection('chats').where('userIsActive', '==', true).count().get(),
        this.db.collection('users').doc(userId).collection('chats').where('kanbanBoardId', '!=', null).count().get()
      ]);

      // Get sample chats for detailed stats
      const chatsSnapshot = await this.db
        .collection('users')
        .doc(userId)
        .collection('chats')
        .orderBy('lastMessageTimestamp', 'desc')
        .limit(100)
        .get();

      let totalMessages = 0;
      let humanMessages = 0;
      let botMessages = 0;
      let contactMessages = 0;
      const topContacts: { chatId: string; contactName: string; messageCount: number }[] = [];

      // This is a simplified version - in production you'd want to aggregate this data
      for (const chatDoc of chatsSnapshot.docs) {
        const chatData = chatDoc.data();
        const chatId = chatDoc.id;
        
        // Get message counts for this chat (this could be expensive for many chats)
        const [allMsgs, humanMsgs, botMsgs, contactMsgs] = await Promise.all([
          this.db.collection('users').doc(userId).collection('chats').doc(chatId).collection('messages_all').count().get(),
          this.db.collection('users').doc(userId).collection('chats').doc(chatId).collection('messages_human').count().get(),
          this.db.collection('users').doc(userId).collection('chats').doc(chatId).collection('messages_bot').count().get(),
          this.db.collection('users').doc(userId).collection('chats').doc(chatId).collection('messages_contact').count().get()
        ]);

        const chatMessageCount = allMsgs.data().count;
        totalMessages += chatMessageCount;
        humanMessages += humanMsgs.data().count;
        botMessages += botMsgs.data().count;
        contactMessages += contactMsgs.data().count;

        if (chatMessageCount > 0) {
          topContacts.push({
            chatId,
            contactName: chatData.contactDisplayName || chatData.contactName || chatId,
            messageCount: chatMessageCount
          });
        }
      }

      // Sort top contacts by message count
      topContacts.sort((a, b) => b.messageCount - a.messageCount);
      const topContactsLimited = topContacts.slice(0, 10);

      const statistics = {
        totalChats: totalChatsSnapshot.data().count,
        activatedChats: activatedChatsSnapshot.data().count,
        activeUsers: activeUsersSnapshot.data().count,
        totalMessages,
        humanMessages,
        botMessages,
        contactMessages,
        chatsWithKanban: chatsWithKanbanSnapshot.data().count,
        averageMessagesPerChat: totalMessages > 0 ? Math.round(totalMessages / Math.max(1, totalChatsSnapshot.data().count)) : 0,
        averageResponseTime: 0, // Would need more complex calculation
        topContacts: topContactsLimited
      };

      res.json({
        success: true,
        data: statistics
      });

    } catch (error) {
      this.logger.error('Error getting chat statistics', {
        userId: req.params.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get statistics',
      });
    }
  }

  /**
   * MIGRADO DE: whatsapp-api/src/worker.js líneas 1617-1670
   * Ensure chat collections exist
   */
  private async ensureChatCollections(userId: string, chatId: string): Promise<boolean> {
    try {
      this.logger.debug('Ensuring chat collections exist', { userId, chatId });

      const chatDocRef = this.db
        .collection('users')
        .doc(userId)
        .collection('chats')
        .doc(chatId);

      // Create empty documents in each collection to ensure they exist
      const collections = ['messages_all', 'messages_human', 'messages_bot', 'messages_contact'];
      const timestamp = new Date().toISOString();

      const initPromises = collections.map(async (collectionName) => {
        const initDocRef = chatDocRef.collection(collectionName).doc('_init');
        const initDoc = await initDocRef.get();
        
        if (!initDoc.exists) {
          await initDocRef.set({
            _init: true,
            timestamp,
            note: 'Collection initialization document'
          });
        }
      });

      await Promise.all(initPromises);
      
      this.logger.debug('Chat collections ensured', { userId, chatId });
      return true;

    } catch (error) {
      this.logger.error('Error ensuring chat collections', {
        userId,
        chatId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Clear chat history (all message collections)
   */
  private async clearChatHistory(userId: string, chatId: string): Promise<void> {
    this.logger.info('Clearing chat history', { userId, chatId });

    const chatDocRef = this.db
      .collection('users')
      .doc(userId)
      .collection('chats')
      .doc(chatId);

    const collections = ['messages_all', 'messages_human', 'messages_bot', 'messages_contact'];

    for (const collectionName of collections) {
      const collectionRef = chatDocRef.collection(collectionName);
      
      // Delete in batches
      let batch = this.db.batch();
      let operationCount = 0;
      
      const snapshot = await collectionRef.get();
      
      snapshot.forEach(doc => {
        batch.delete(doc.ref);
        operationCount++;
        
        if (operationCount >= 499) {
          // Execute batch and create new one
          batch.commit();
          batch = this.db.batch();
          operationCount = 0;
        }
      });

      // Execute remaining operations
      if (operationCount > 0) {
        await batch.commit();
      }
    }

    this.logger.info('Chat history cleared', { userId, chatId });
  }

  /**
   * Delete chat completely including all subcollections
   */
  private async deleteChatCompletely(userId: string, chatId: string): Promise<void> {
    this.logger.info('Deleting chat completely', { userId, chatId });

    // First clear all message collections
    await this.clearChatHistory(userId, chatId);

    // Delete the chat document itself
    await this.db
      .collection('users')
      .doc(userId)
      .collection('chats')
      .doc(chatId)
      .delete();

    this.logger.info('Chat deleted completely', { userId, chatId });
  }

  /**
   * Log chat activity for auditing
   */
  private async logChatActivity(
    userId: string, 
    chatId: string, 
    action: string, 
    details: string, 
    metadata?: any
  ): Promise<void> {
    try {
      await this.db
        .collection('users')
        .doc(userId)
        .collection('chat_activities')
        .add({
          chatId,
          action,
          details,
          metadata: metadata || {},
          timestamp: new Date().toISOString()
        });
    } catch (error) {
      this.logger.error('Error logging chat activity', {
        userId,
        chatId,
        action,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
} 