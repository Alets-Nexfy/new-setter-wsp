import { Request, Response } from 'express';
import { LoggerService } from '@/core/services/LoggerService';
import { DatabaseService } from '@/core/services/DatabaseService';
import { WorkerManagerService } from '@/core/services/WorkerManagerService';
import { 
  Message,
  SendMessageRequest,
  GetMessagesRequest,
  MessageFilters,
  MessageSortOptions,
  MessageStatistics,
  ConversationContext,
  MessageOrigin,
  MessageType
} from '@/shared/types/chat';
import { FieldValue } from 'firebase-admin/firestore';

export class MessageController {
  private logger: LoggerService;
  private db: DatabaseService;
  private workerManager: WorkerManagerService;

  // Constants for conversation management
  private readonly MAX_CONVERSATION_TOKENS = 15000;
  private readonly MAX_HISTORY_TOKENS_FOR_PROMPT = 2000;
  private readonly TOKEN_ESTIMATE_RATIO = 4;

  constructor() {
    this.logger = LoggerService.getInstance();
    this.db = DatabaseService.getInstance();
    this.workerManager = WorkerManagerService.getInstance();
  }

  /**
   * MIGRADO DE: whatsapp-api/src/server.js líneas 2455-2592
   * GET /api/v2/messages/:userId/:chatId
   * MEJORAS: TypeScript, pagination, filtros avanzados, performance optimizations
   */
  public async getMessages(req: Request, res: Response): Promise<void> {
    try {
      const { userId, chatId } = req.params;
      const {
        limit = 50,
        offset = 0,
        before,
        after,
        origin,
        type,
        search,
        sortBy = 'timestamp',
        sortOrder = 'asc'
      } = req.query;

      if (!userId || !chatId) {
        res.status(400).json({
          success: false,
          error: 'User ID and Chat ID are required',
        });
        return;
      }

      this.logger.info('Get messages request', {
        userId,
        chatId,
        limit: Number(limit),
        offset: Number(offset),
        before,
        after,
        origin,
        type
      });

      // Verify chat exists
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

      // Build query
      const messagesRef = this.db
        .collection('users')
        .doc(userId)
        .collection('chats')
        .doc(chatId)
        .collection('messages_all');

      let query = messagesRef.orderBy('timestamp', sortOrder as 'asc' | 'desc');

      // Apply filters
      if (origin) {
        query = query.where('origin', '==', origin);
      }

      if (type) {
        query = query.where('type', '==', type);
      }

      // Apply temporal filters
      if (before) {
        try {
          const beforeTimestamp = this.db.timestamp(new Date(before as string));
          query = query.where('timestamp', '<', beforeTimestamp);
        } catch (error) {
          res.status(400).json({
            success: false,
            error: 'Invalid before timestamp format (use ISO 8601)',
          });
          return;
        }
      }

      if (after) {
        try {
          const afterTimestamp = this.db.timestamp(new Date(after as string));
          query = query.where('timestamp', '>', afterTimestamp);
        } catch (error) {
          res.status(400).json({
            success: false,
            error: 'Invalid after timestamp format (use ISO 8601)',
          });
          return;
        }
      }

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
      const messagesSnapshot = await query.get();

      const messages: Message[] = [];
      for (const doc of messagesSnapshot.docs) {
        const data = doc.data();

        // Apply text search filter (post-query)
        if (search) {
          const searchLower = search.toString().toLowerCase();
          const body = (data.body || '').toLowerCase();
          
          if (!body.includes(searchLower)) {
            continue;
          }
        }

        messages.push({
          id: doc.id,
          chatId,
          ack: data.ack || 0,
          body: data.body || '',
          from: data.from || '',
          to: data.to || '',
          fromMe: data.isFromMe || false,
          hasMedia: data.hasMedia || false,
          hasReacted: data.hasReacted || false,
          hasSticker: data.hasSticker || false,
          inviteV4: data.inviteV4,
          isEphemeral: data.isEphemeral || false,
          isForwarded: data.isForwarded || false,
          isGif: data.isGif || false,
          isStarred: data.isStarred || false,
          isStatus: data.isStatus || false,
          mediaKey: data.mediaKey,
          mediaUrl: data.mediaUrl,
          mediaType: data.mediaType,
          mediaSize: data.mediaSize,
          mentionedIds: data.mentionedIds || [],
          origin: data.origin || 'contact',
          reaction: data.reaction,
          status: data.status || 'sent',
          timestamp: data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : data.timestamp,
          type: data.type || 'text',
          vCards: data.vCards || [],
          messageId: data.messageId,
          isAutoReply: data.isAutoReply || false,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : new Date().toISOString()
        });
      }

      // Get total count for pagination
      const totalSnapshot = await messagesRef.count().get();
      const total = totalSnapshot.data().count;

      this.logger.info('Messages retrieved successfully', {
        userId,
        chatId,
        count: messages.length,
        total
      });

      res.json({
        success: true,
        data: messages,
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
          total,
          hasMore: messages.length === Number(limit)
        }
      });

    } catch (error) {
      this.logger.error('Error getting messages', {
        userId: req.params.userId,
        chatId: req.params.chatId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Handle specific Firestore errors
      if (error instanceof Error && error.message.includes('requires an index')) {
        res.status(500).json({
          success: false,
          error: 'Database index required for this query. Contact administrator.',
          code: 'INDEX_REQUIRED'
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to get messages',
      });
    }
  }

  /**
   * MIGRADO DE: whatsapp-api/src/server.js líneas 2592-2676
   * POST /api/v2/messages/:userId/:chatId
   * MEJORAS: TypeScript, WorkerManagerService integration, validation completa
   */
  public async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const { userId, chatId } = req.params;
      const { message, origin = 'human', metadata = {} }: SendMessageRequest = req.body;

      if (!userId || !chatId) {
        res.status(400).json({
          success: false,
          error: 'User ID and Chat ID are required',
        });
        return;
      }

      if (!message || !message.trim()) {
        res.status(400).json({
          success: false,
          error: 'Message content is required',
        });
        return;
      }

      this.logger.info('Send message request', {
        userId,
        chatId,
        messageLength: message.trim().length,
        origin
      });

      // Check if worker is connected and active
      if (!this.workerManager.isWorkerActive(userId)) {
        res.status(400).json({
          success: false,
          error: `User ${userId} is not connected to WhatsApp. Please connect first.`,
        });
        return;
      }

      // Verify worker status from Firestore
      const statusDoc = await this.db
        .collection('users')
        .doc(userId)
        .collection('status')
        .doc('whatsapp')
        .get();

      if (!statusDoc.exists || statusDoc.data()?.status !== 'connected') {
        const currentStatus = statusDoc.exists ? statusDoc.data()?.status : 'not_found';
        res.status(400).json({
          success: false,
          error: `WhatsApp not connected (status: ${currentStatus}). Please connect first.`,
        });
        return;
      }

      // Send message via worker
      const success = await this.workerManager.sendMessage(
        userId,
        chatId,
        message.trim()
      );

      if (!success) {
        res.status(500).json({
          success: false,
          error: 'Failed to send message command to worker',
        });
        return;
      }

      // Save message to Firestore (human origin)
      await this.saveMessage(userId, chatId, {
        from: `me (HUMAN - ${userId})`,
        to: chatId,
        body: message.trim(),
        timestamp: FieldValue.serverTimestamp(),
        isFromMe: true,
        isAutoReply: false,
        origin: origin as MessageOrigin,
        type: 'text',
        hasMedia: false,
        hasReacted: false,
        hasSticker: false,
        isEphemeral: false,
        isForwarded: false,
        isGif: false,
        isStarred: false,
        isStatus: false,
        mentionedIds: [],
        vCards: [],
        status: 'sent'
      });

      // Update chat metadata
      await this.updateChatAfterMessage(userId, chatId, message.trim(), 'human');

      this.logger.info('Message sent successfully', {
        userId,
        chatId,
        messageLength: message.trim().length
      });

      res.json({
        success: true,
        message: 'Message sent successfully',
        data: {
          chatId,
          content: message.trim(),
          origin,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      this.logger.error('Error sending message', {
        userId: req.params.userId,
        chatId: req.params.chatId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to send message',
      });
    }
  }

  /**
   * GET /api/v2/messages/:userId/:chatId/:messageId
   * Get specific message by ID
   */
  public async getMessage(req: Request, res: Response): Promise<void> {
    try {
      const { userId, chatId, messageId } = req.params;

      if (!userId || !chatId || !messageId) {
        res.status(400).json({
          success: false,
          error: 'User ID, Chat ID, and Message ID are required',
        });
        return;
      }

      this.logger.debug('Get message request', { userId, chatId, messageId });

      const messageDoc = await this.db
        .collection('users')
        .doc(userId)
        .collection('chats')
        .doc(chatId)
        .collection('messages_all')
        .doc(messageId)
        .get();

      if (!messageDoc.exists) {
        res.status(404).json({
          success: false,
          error: 'Message not found',
        });
        return;
      }

      const data = messageDoc.data()!;
      const message: Message = {
        id: messageDoc.id,
        chatId,
        ack: data.ack || 0,
        body: data.body || '',
        from: data.from || '',
        to: data.to || '',
        fromMe: data.isFromMe || false,
        hasMedia: data.hasMedia || false,
        hasReacted: data.hasReacted || false,
        hasSticker: data.hasSticker || false,
        inviteV4: data.inviteV4,
        isEphemeral: data.isEphemeral || false,
        isForwarded: data.isForwarded || false,
        isGif: data.isGif || false,
        isStarred: data.isStarred || false,
        isStatus: data.isStatus || false,
        mediaKey: data.mediaKey,
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType,
        mediaSize: data.mediaSize,
        mentionedIds: data.mentionedIds || [],
        origin: data.origin || 'contact',
        reaction: data.reaction,
        status: data.status || 'sent',
        timestamp: data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : data.timestamp,
        type: data.type || 'text',
        vCards: data.vCards || [],
        messageId: data.messageId,
        isAutoReply: data.isAutoReply || false,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : new Date().toISOString()
      };

      res.json({
        success: true,
        data: message
      });

    } catch (error) {
      this.logger.error('Error getting message', {
        userId: req.params.userId,
        chatId: req.params.chatId,
        messageId: req.params.messageId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get message',
      });
    }
  }

  /**
   * MIGRADO DE: whatsapp-api/src/worker.js líneas 1884-1980
   * GET /api/v2/messages/:userId/:chatId/conversation-history
   * MEJORAS: TypeScript, token management, configureable limits
   */
  public async getConversationHistory(req: Request, res: Response): Promise<void> {
    try {
      const { userId, chatId } = req.params;
      const { maxMessages = 6, maxTokens = 2000 } = req.query;

      if (!userId || !chatId) {
        res.status(400).json({
          success: false,
          error: 'User ID and Chat ID are required',
        });
        return;
      }

      this.logger.debug('Get conversation history request', {
        userId,
        chatId,
        maxMessages: Number(maxMessages),
        maxTokens: Number(maxTokens)
      });

      const conversationContext = await this.buildConversationContext(
        userId,
        chatId,
        Number(maxMessages),
        Number(maxTokens)
      );

      res.json({
        success: true,
        data: conversationContext
      });

    } catch (error) {
      this.logger.error('Error getting conversation history', {
        userId: req.params.userId,
        chatId: req.params.chatId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get conversation history',
      });
    }
  }

  /**
   * GET /api/v2/messages/:userId/:chatId/statistics
   * Get message statistics for a chat
   */
  public async getMessageStatistics(req: Request, res: Response): Promise<void> {
    try {
      const { userId, chatId } = req.params;

      if (!userId || !chatId) {
        res.status(400).json({
          success: false,
          error: 'User ID and Chat ID are required',
        });
        return;
      }

      this.logger.debug('Get message statistics request', { userId, chatId });

      // Get counts for each message collection
      const [
        allMsgsSnapshot,
        humanMsgsSnapshot,
        botMsgsSnapshot,
        contactMsgsSnapshot
      ] = await Promise.all([
        this.db.collection('users').doc(userId).collection('chats').doc(chatId).collection('messages_all').count().get(),
        this.db.collection('users').doc(userId).collection('chats').doc(chatId).collection('messages_human').count().get(),
        this.db.collection('users').doc(userId).collection('chats').doc(chatId).collection('messages_bot').count().get(),
        this.db.collection('users').doc(userId).collection('chats').doc(chatId).collection('messages_contact').count().get()
      ]);

      // Get sample messages for type analysis
      const messagesSnapshot = await this.db
        .collection('users')
        .doc(userId)
        .collection('chats')
        .doc(chatId)
        .collection('messages_all')
        .orderBy('timestamp', 'desc')
        .limit(100)
        .get();

      // Analyze message types
      const messagesByType = {
        text: 0,
        image: 0,
        video: 0,
        audio: 0,
        document: 0,
        sticker: 0,
        location: 0,
        contact: 0,
        other: 0
      };

      let totalCharacters = 0;
      let messageCount = 0;

      messagesSnapshot.forEach(doc => {
        const data = doc.data();
        const type = data.type || 'text';
        
        if (messagesByType.hasOwnProperty(type)) {
          messagesByType[type as keyof typeof messagesByType]++;
        } else {
          messagesByType.other++;
        }

        if (data.body) {
          totalCharacters += data.body.length;
          messageCount++;
        }
      });

      const statistics: MessageStatistics = {
        totalMessages: allMsgsSnapshot.data().count,
        messagesByOrigin: {
          human: humanMsgsSnapshot.data().count,
          bot: botMsgsSnapshot.data().count,
          contact: contactMsgsSnapshot.data().count,
          system: 0
        },
        messagesByType,
        messagesPerDay: [], // Would need more complex aggregation
        averageMessageLength: messageCount > 0 ? Math.round(totalCharacters / messageCount) : 0,
        responseTimeStats: {
          average: 0, // Would need timestamp analysis
          median: 0,
          min: 0,
          max: 0
        }
      };

      res.json({
        success: true,
        data: statistics
      });

    } catch (error) {
      this.logger.error('Error getting message statistics', {
        userId: req.params.userId,
        chatId: req.params.chatId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get message statistics',
      });
    }
  }

  /**
   * DELETE /api/v2/messages/:userId/:chatId/clear-history
   * Clear all messages in a chat
   */
  public async clearHistory(req: Request, res: Response): Promise<void> {
    try {
      const { userId, chatId } = req.params;
      const { keepLastMessages = 0 } = req.body;

      if (!userId || !chatId) {
        res.status(400).json({
          success: false,
          error: 'User ID and Chat ID are required',
        });
        return;
      }

      this.logger.info('Clear chat history request', { 
        userId, 
        chatId, 
        keepLastMessages: Number(keepLastMessages) 
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

      const collections = ['messages_all', 'messages_human', 'messages_bot', 'messages_contact'];
      let totalDeleted = 0;

      for (const collectionName of collections) {
        const collectionRef = chatDocRef.collection(collectionName);
        
        // If keeping some messages, get the ones to keep first
        let messagesToKeep: any[] = [];
        if (Number(keepLastMessages) > 0) {
          const keepSnapshot = await collectionRef
            .orderBy('timestamp', 'desc')
            .limit(Number(keepLastMessages))
            .get();
          
          messagesToKeep = keepSnapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        }

        // Delete all messages
        let batch = this.db.batch();
        let operationCount = 0;
        
        const snapshot = await collectionRef.get();
        totalDeleted += snapshot.docs.length - messagesToKeep.length;
        
        snapshot.forEach(doc => {
          batch.delete(doc.ref);
          operationCount++;
          
          if (operationCount >= 499) {
            batch.commit();
            batch = this.db.batch();
            operationCount = 0;
          }
        });

        if (operationCount > 0) {
          await batch.commit();
        }

        // Re-add messages to keep
        if (messagesToKeep.length > 0) {
          let restoreBatch = this.db.batch();
          let restoreCount = 0;
          
          messagesToKeep.forEach(msg => {
            const newDocRef = collectionRef.doc();
            restoreBatch.set(newDocRef, msg.data);
            restoreCount++;
            
            if (restoreCount >= 499) {
              restoreBatch.commit();
              restoreBatch = this.db.batch();
              restoreCount = 0;
            }
          });

          if (restoreCount > 0) {
            await restoreBatch.commit();
          }
        }
      }

      // Update chat metadata
      await chatDocRef.update({
        historyClearedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      this.logger.info('Chat history cleared successfully', {
        userId,
        chatId,
        totalDeleted,
        messagesKept: Number(keepLastMessages)
      });

      res.json({
        success: true,
        message: 'Chat history cleared successfully',
        data: {
          chatId,
          messagesDeleted: totalDeleted,
          messagesKept: Number(keepLastMessages),
          clearedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      this.logger.error('Error clearing chat history', {
        userId: req.params.userId,
        chatId: req.params.chatId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to clear chat history',
      });
    }
  }

  /**
   * MIGRADO DE: whatsapp-api/src/worker.js líneas 1884-1980
   * Build conversation context for AI with token management
   */
  private async buildConversationContext(
    userId: string,
    chatId: string,
    maxMessages: number = 6,
    maxTokens: number = 2000
  ): Promise<ConversationContext> {
    try {
      this.logger.debug('Building conversation context', {
        userId,
        chatId,
        maxMessages,
        maxTokens
      });

      const chatDocRef = this.db
        .collection('users')
        .doc(userId)
        .collection('chats')
        .doc(chatId);

      // Get recent messages ordered by timestamp
      const messagesSnapshot = await chatDocRef
        .collection('messages_all')
        .orderBy('timestamp', 'desc')
        .limit(maxMessages * 2) // Get more to have selection margin
        .get();

      if (messagesSnapshot.empty) {
        return {
          chatId,
          messages: [],
          totalTokens: 0,
          lastUpdated: new Date().toISOString()
        };
      }

      // Convert to context messages and sort chronologically
      const messages: ConversationContext['messages'] = [];
      messagesSnapshot.forEach(doc => {
        const msgData = doc.data();
        
        // Only include messages with body (text)
        if (msgData.body) {
          const estimatedTokens = Math.ceil((msgData.body.length || 0) / this.TOKEN_ESTIMATE_RATIO);
          
          messages.push({
            role: (msgData.origin === 'bot' || (msgData.isFromMe === true && msgData.isAutoReply === true)) ? 'assistant' : 'user',
            content: msgData.body,
            timestamp: msgData.timestamp?.toDate?.() ? msgData.timestamp.toDate().toISOString() : msgData.timestamp,
            estimatedTokens
          });
        }
      });

      // Sort chronologically (oldest first)
      messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Apply token limit
      let totalTokens = 0;
      const selectedMessages: ConversationContext['messages'] = [];

      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (totalTokens + message.estimatedTokens <= maxTokens) {
          selectedMessages.unshift(message); // Add to beginning to maintain order
          totalTokens += message.estimatedTokens;
        } else {
          break;
        }
      }

      this.logger.debug('Conversation context built', {
        userId,
        chatId,
        totalMessages: messages.length,
        selectedMessages: selectedMessages.length,
        totalTokens
      });

      return {
        chatId,
        messages: selectedMessages,
        totalTokens,
        lastUpdated: new Date().toISOString()
      };

    } catch (error) {
      this.logger.error('Error building conversation context', {
        userId,
        chatId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        chatId,
        messages: [],
        totalTokens: 0,
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Save message to appropriate collections
   */
  private async saveMessage(userId: string, chatId: string, messageData: any): Promise<void> {
    const chatDocRef = this.db
      .collection('users')
      .doc(userId)
      .collection('chats')
      .doc(chatId);

    const timestamp = FieldValue.serverTimestamp();
    const fullMessageData = {
      ...messageData,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const savePromises = [
      // Always save to messages_all
      chatDocRef.collection('messages_all').add(fullMessageData)
    ];

    // Save to appropriate origin-specific collection
    switch (messageData.origin) {
      case 'human':
        savePromises.push(
          chatDocRef.collection('messages_human').add(fullMessageData)
        );
        break;
      case 'bot':
        savePromises.push(
          chatDocRef.collection('messages_bot').add(fullMessageData)
        );
        break;
      case 'contact':
        savePromises.push(
          chatDocRef.collection('messages_contact').add(fullMessageData)
        );
        break;
    }

    await Promise.all(savePromises);
    
    this.logger.debug('Message saved to collections', {
      userId,
      chatId,
      origin: messageData.origin,
      collections: savePromises.length
    });
  }

  /**
   * Update chat metadata after message
   */
  private async updateChatAfterMessage(
    userId: string,
    chatId: string,
    content: string,
    origin: MessageOrigin
  ): Promise<void> {
    const chatDocRef = this.db
      .collection('users')
      .doc(userId)
      .collection('chats')
      .doc(chatId);

    const timestamp = FieldValue.serverTimestamp();
    const updateData: any = {
      lastMessageContent: content,
      lastMessageTimestamp: timestamp,
      lastMessageOrigin: origin,
      lastActivityTimestamp: timestamp,
      updatedAt: timestamp
    };

    // Set specific timestamp based on origin
    switch (origin) {
      case 'human':
        updateData.lastHumanMessageTimestamp = timestamp;
        updateData.userIsActive = true;
        break;
      case 'bot':
        updateData.lastBotMessageTimestamp = timestamp;
        break;
      case 'contact':
        updateData.lastContactMessageTimestamp = timestamp;
        break;
    }

    await chatDocRef.set(updateData, { merge: true });
    
    this.logger.debug('Chat metadata updated', {
      userId,
      chatId,
      origin
    });
  }
} 