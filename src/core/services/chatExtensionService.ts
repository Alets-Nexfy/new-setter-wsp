import { db } from '../config/firebase';
import { ChatExtension, ExtensionType, CreateChatExtensionDto, UpdateChatExtensionDto } from '../types/chatExtension';
import { logger } from '../utils/logger';

export class ChatExtensionService {
  private readonly chatExtensionsCollection = 'chatExtensions';

  /**
   * Create a new chat extension
   */
  async createChatExtension(data: CreateChatExtensionDto): Promise<ChatExtension> {
    try {
      const chatExtension: ChatExtension = {
        id: '',
        userId: data.userId,
        name: data.name,
        type: data.type,
        content: data.content,
        description: data.description || '',
        isActive: data.isActive ?? true,
        tags: data.tags || [],
        metadata: data.metadata || {},
        usageCount: 0,
        lastUsed: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const docRef = await db.collection(this.chatExtensionsCollection).add(chatExtension);
      chatExtension.id = docRef.id;

      await docRef.update({ id: docRef.id });

      logger.info(`Chat extension created: ${docRef.id} for user: ${data.userId}`);
      return chatExtension;
    } catch (error) {
      logger.error('Error creating chat extension:', error);
      throw new Error('Failed to create chat extension');
    }
  }

  /**
   * Get chat extension by ID
   */
  async getChatExtension(extensionId: string): Promise<ChatExtension | null> {
    try {
      const doc = await db.collection(this.chatExtensionsCollection).doc(extensionId).get();
      
      if (!doc.exists) {
        return null;
      }

      return doc.data() as ChatExtension;
    } catch (error) {
      logger.error('Error getting chat extension:', error);
      throw new Error('Failed to get chat extension');
    }
  }

  /**
   * Get user's chat extensions
   */
  async getUserChatExtensions(userId: string, options: {
    type?: ExtensionType;
    isActive?: boolean;
    tags?: string[];
    limit?: number;
    offset?: number;
  } = {}): Promise<{ extensions: ChatExtension[]; total: number }> {
    try {
      let query = db.collection(this.chatExtensionsCollection)
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc');

      if (options.isActive !== undefined) {
        query = query.where('isActive', '==', options.isActive);
      }

      if (options.type) {
        query = query.where('type', '==', options.type);
      }

      const snapshot = await query.get();
      let extensions: ChatExtension[] = [];

      snapshot.forEach(doc => {
        const data = doc.data() as ChatExtension;
        
        // Filter by tags if specified
        if (options.tags && options.tags.length > 0) {
          const hasMatchingTag = options.tags.some(tag => data.tags.includes(tag));
          if (!hasMatchingTag) return;
        }
        
        extensions.push(data);
      });

      // Apply pagination
      const total = extensions.length;
      const start = options.offset || 0;
      const end = start + (options.limit || 50);
      const paginatedExtensions = extensions.slice(start, end);

      return {
        extensions: paginatedExtensions,
        total
      };
    } catch (error) {
      logger.error('Error getting user chat extensions:', error);
      throw new Error('Failed to get user chat extensions');
    }
  }

  /**
   * Update chat extension
   */
  async updateChatExtension(extensionId: string, data: UpdateChatExtensionDto): Promise<ChatExtension> {
    try {
      const updateData: Partial<ChatExtension> = {
        ...data,
        updatedAt: new Date()
      };

      await db.collection(this.chatExtensionsCollection).doc(extensionId).update(updateData);

      const updated = await db.collection(this.chatExtensionsCollection).doc(extensionId).get();
      return updated.data() as ChatExtension;
    } catch (error) {
      logger.error('Error updating chat extension:', error);
      throw new Error('Failed to update chat extension');
    }
  }

  /**
   * Delete chat extension
   */
  async deleteChatExtension(extensionId: string): Promise<void> {
    try {
      await db.collection(this.chatExtensionsCollection).doc(extensionId).delete();
      logger.info(`Chat extension deleted: ${extensionId}`);
    } catch (error) {
      logger.error('Error deleting chat extension:', error);
      throw new Error('Failed to delete chat extension');
    }
  }

  /**
   * Toggle chat extension active status
   */
  async toggleChatExtension(extensionId: string): Promise<ChatExtension> {
    try {
      const extension = await this.getChatExtension(extensionId);
      
      if (!extension) {
        throw new Error('Chat extension not found');
      }

      return await this.updateChatExtension(extensionId, {
        isActive: !extension.isActive
      });
    } catch (error) {
      logger.error('Error toggling chat extension:', error);
      throw new Error('Failed to toggle chat extension');
    }
  }

  /**
   * Increment usage count for chat extension
   */
  async incrementUsage(extensionId: string): Promise<void> {
    try {
      await db.collection(this.chatExtensionsCollection).doc(extensionId).update({
        usageCount: db.FieldValue.increment(1),
        lastUsed: new Date(),
        updatedAt: new Date()
      });
    } catch (error) {
      logger.error('Error incrementing usage:', error);
      // Don't throw error for usage tracking
    }
  }

  /**
   * Get popular chat extensions for user
   */
  async getPopularExtensions(userId: string, limit: number = 10): Promise<ChatExtension[]> {
    try {
      const snapshot = await db.collection(this.chatExtensionsCollection)
        .where('userId', '==', userId)
        .where('isActive', '==', true)
        .orderBy('usageCount', 'desc')
        .limit(limit)
        .get();

      const extensions: ChatExtension[] = [];
      snapshot.forEach(doc => {
        extensions.push(doc.data() as ChatExtension);
      });

      return extensions;
    } catch (error) {
      logger.error('Error getting popular extensions:', error);
      throw new Error('Failed to get popular extensions');
    }
  }

  /**
   * Search chat extensions
   */
  async searchExtensions(userId: string, query: string, options: {
    type?: ExtensionType;
    tags?: string[];
    limit?: number;
  } = {}): Promise<ChatExtension[]> {
    try {
      let dbQuery = db.collection(this.chatExtensionsCollection)
        .where('userId', '==', userId)
        .where('isActive', '==', true);

      if (options.type) {
        dbQuery = dbQuery.where('type', '==', options.type);
      }

      const snapshot = await dbQuery.get();
      const extensions: ChatExtension[] = [];

      snapshot.forEach(doc => {
        const data = doc.data() as ChatExtension;
        
        // Search in name, description, content, and tags
        const searchText = query.toLowerCase();
        const matchesName = data.name.toLowerCase().includes(searchText);
        const matchesDescription = data.description.toLowerCase().includes(searchText);
        const matchesContent = data.content.toLowerCase().includes(searchText);
        const matchesTags = data.tags.some(tag => tag.toLowerCase().includes(searchText));

        if (matchesName || matchesDescription || matchesContent || matchesTags) {
          // Filter by tags if specified
          if (options.tags && options.tags.length > 0) {
            const hasMatchingTag = options.tags.some(tag => data.tags.includes(tag));
            if (!hasMatchingTag) return;
          }
          
          extensions.push(data);
        }
      });

      // Sort by relevance (name matches first, then description, etc.)
      extensions.sort((a, b) => {
        const aName = a.name.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
        const bName = b.name.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
        return bName - aName;
      });

      return extensions.slice(0, options.limit || 50);
    } catch (error) {
      logger.error('Error searching extensions:', error);
      throw new Error('Failed to search extensions');
    }
  }

  /**
   * Get chat extension statistics
   */
  async getExtensionStats(userId: string): Promise<{
    total: number;
    active: number;
    byType: Record<string, number>;
    byTag: Record<string, number>;
    totalUsage: number;
    mostUsed: ChatExtension[];
  }> {
    try {
      const snapshot = await db.collection(this.chatExtensionsCollection)
        .where('userId', '==', userId)
        .get();

      const stats = {
        total: 0,
        active: 0,
        byType: {} as Record<string, number>,
        byTag: {} as Record<string, number>,
        totalUsage: 0,
        mostUsed: [] as ChatExtension[]
      };

      const extensions: ChatExtension[] = [];

      snapshot.forEach(doc => {
        const data = doc.data() as ChatExtension;
        extensions.push(data);
        
        stats.total++;
        stats.totalUsage += data.usageCount;

        if (data.isActive) {
          stats.active++;
        }

        stats.byType[data.type] = (stats.byType[data.type] || 0) + 1;

        data.tags.forEach(tag => {
          stats.byTag[tag] = (stats.byTag[tag] || 0) + 1;
        });
      });

      // Get most used extensions
      stats.mostUsed = extensions
        .sort((a, b) => b.usageCount - a.usageCount)
        .slice(0, 5);

      return stats;
    } catch (error) {
      logger.error('Error getting extension stats:', error);
      throw new Error('Failed to get extension stats');
    }
  }

  /**
   * Duplicate chat extension
   */
  async duplicateExtension(extensionId: string, newName: string): Promise<ChatExtension> {
    try {
      const original = await this.getChatExtension(extensionId);
      
      if (!original) {
        throw new Error('Chat extension not found');
      }

      const duplicated: CreateChatExtensionDto = {
        userId: original.userId,
        name: newName,
        type: original.type,
        content: original.content,
        description: original.description,
        isActive: false, // Start as inactive
        tags: [...original.tags],
        metadata: { ...original.metadata, duplicatedFrom: extensionId }
      };

      return await this.createChatExtension(duplicated);
    } catch (error) {
      logger.error('Error duplicating extension:', error);
      throw new Error('Failed to duplicate extension');
    }
  }
} 