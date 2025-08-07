import { SupabaseService } from './SupabaseService';
import { LoggerService } from './LoggerService';
import { ChatExtension, ExtensionType, CreateChatExtensionDto, UpdateChatExtensionDto } from '../types/chatExtension';

export class ChatExtensionService {
  private static instance: ChatExtensionService;
  private db: SupabaseService;
  private logger: LoggerService;
  private readonly tableName = 'chat_extensions';

  private constructor() {
    this.db = SupabaseService.getInstance();
    this.logger = LoggerService.getInstance();
  }

  static getInstance(): ChatExtensionService {
    if (!ChatExtensionService.instance) {
      ChatExtensionService.instance = new ChatExtensionService();
    }
    return ChatExtensionService.instance;
  }

  /**
   * Create a new chat extension
   */
  async createChatExtension(data: CreateChatExtensionDto): Promise<ChatExtension> {
    try {
      const { data: result, error } = await this.db
        .from(this.tableName)
        .insert({
          user_id: data.userId,
          name: data.name,
          type: data.type,
          content: data.content,
          description: data.description || '',
          is_active: data.isActive ?? true,
          tags: data.tags || [],
          metadata: data.metadata || {},
          usage_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      const chatExtension = this.mapFromDatabase(result);
      this.logger.info(`Chat extension created: ${chatExtension.id} for user: ${data.userId}`);
      return chatExtension;
    } catch (error) {
      this.logger.error('Error creating chat extension:', error);
      throw new Error('Failed to create chat extension');
    }
  }

  /**
   * Get chat extension by ID
   */
  async getChatExtension(extensionId: string): Promise<ChatExtension | null> {
    try {
      const { data, error } = await this.db
        .from(this.tableName)
        .select('*')
        .eq('id', extensionId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }

      return this.mapFromDatabase(data);
    } catch (error) {
      this.logger.error('Error getting chat extension:', error);
      throw new Error('Failed to get chat extension');
    }
  }

  /**
   * Get all chat extensions for a user
   */
  async getUserChatExtensions(userId: string): Promise<ChatExtension[]> {
    try {
      const { data, error } = await this.db
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;

      return data.map(item => this.mapFromDatabase(item));
    } catch (error) {
      this.logger.error('Error getting user chat extensions:', error);
      throw new Error('Failed to get user chat extensions');
    }
  }

  /**
   * Update a chat extension
   */
  async updateChatExtension(extensionId: string, updateData: UpdateChatExtensionDto): Promise<ChatExtension | null> {
    try {
      const dbData = this.mapToDatabase(updateData);
      const { error } = await this.db
        .from(this.tableName)
        .update({
          ...dbData,
          updated_at: new Date().toISOString()
        })
        .eq('id', extensionId);

      if (error) throw error;

      return await this.getChatExtension(extensionId);
    } catch (error) {
      this.logger.error('Error updating chat extension:', error);
      throw new Error('Failed to update chat extension');
    }
  }

  /**
   * Delete a chat extension
   */
  async deleteChatExtension(extensionId: string): Promise<void> {
    try {
      const { error } = await this.db
        .from(this.tableName)
        .delete()
        .eq('id', extensionId);

      if (error) throw error;
      this.logger.info(`Chat extension deleted: ${extensionId}`);
    } catch (error) {
      this.logger.error('Error deleting chat extension:', error);
      throw new Error('Failed to delete chat extension');
    }
  }

  /**
   * Increment usage count for a chat extension
   */
  async incrementUsage(extensionId: string): Promise<void> {
    try {
      // Get current usage count and increment it
      const current = await this.getChatExtension(extensionId);
      if (current) {
        const { error } = await this.db
          .from(this.tableName)
          .update({
            usage_count: (current.usageCount || 0) + 1,
            last_used: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', extensionId);

        if (error) throw error;
      }
    } catch (error) {
      this.logger.error('Error incrementing usage:', error);
      // Don't throw error for usage tracking
    }
  }

  private mapFromDatabase(data: any): ChatExtension {
    return {
      id: data.id,
      userId: data.user_id,
      name: data.name,
      type: data.type,
      content: data.content,
      description: data.description,
      isActive: data.is_active,
      tags: data.tags || [],
      metadata: data.metadata || {},
      usageCount: data.usage_count,
      lastUsed: data.last_used,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  async toggleChatExtension(extensionId: string): Promise<ChatExtension | null> {
    try {
      const extension = await this.getChatExtension(extensionId);
      if (!extension) return null;

      const { error } = await this.db
        .from(this.tableName)
        .update({ 
          is_active: !extension.isActive,
          updated_at: new Date().toISOString()
        })
        .eq('id', extensionId);

      if (error) throw error;
      return await this.getChatExtension(extensionId);
    } catch (error) {
      this.logger.error('Error toggling extension:', error);
      throw new Error('Failed to toggle extension');
    }
  }

  async getPopularExtensions(userId: string, limit: number = 10): Promise<ChatExtension[]> {
    try {
      const { data, error } = await this.db
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('usage_count', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data?.map(item => this.mapFromDatabase(item)) || [];
    } catch (error) {
      this.logger.error('Error getting popular extensions:', error);
      throw new Error('Failed to get popular extensions');
    }
  }

  async searchExtensions(userId: string, query: string, options: any): Promise<ChatExtension[]> {
    try {
      const { data, error } = await this.db
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId)
        .ilike('name', `%${query}%`);

      if (error) throw error;
      return data?.map(item => this.mapFromDatabase(item)) || [];
    } catch (error) {
      this.logger.error('Error searching extensions:', error);
      throw new Error('Failed to search extensions');
    }
  }

  async getExtensionStats(userId: string): Promise<any> {
    try {
      const { data, error } = await this.db
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;
      
      const extensions = data?.map(item => this.mapFromDatabase(item)) || [];
      return {
        total: extensions.length,
        active: extensions.filter(e => e.isActive).length,
        totalUsage: extensions.reduce((sum, e) => sum + (e.usageCount || 0), 0)
      };
    } catch (error) {
      this.logger.error('Error getting extension stats:', error);
      throw new Error('Failed to get extension stats');
    }
  }

  async duplicateExtension(extensionId: string, newName: string): Promise<ChatExtension> {
    try {
      const original = await this.getChatExtension(extensionId);
      if (!original) throw new Error('Extension not found');

      const duplicateData = {
        userId: original.userId,
        name: newName,
        type: original.type,
        content: original.content,
        description: original.description,
        isActive: false,
        tags: original.tags,
        metadata: { ...original.metadata, duplicatedFrom: extensionId }
      };

      return await this.createChatExtension(duplicateData);
    } catch (error) {
      this.logger.error('Error duplicating extension:', error);
      throw new Error('Failed to duplicate extension');
    }
  }

  private mapToDatabase(data: Partial<ChatExtension>): any {
    const dbData: any = {};
    if (data.name !== undefined) dbData.name = data.name;
    if (data.type !== undefined) dbData.type = data.type;
    if (data.content !== undefined) dbData.content = data.content;
    if (data.description !== undefined) dbData.description = data.description;
    if (data.isActive !== undefined) dbData.is_active = data.isActive;
    if (data.tags !== undefined) dbData.tags = data.tags;
    if (data.metadata !== undefined) dbData.metadata = data.metadata;
    return dbData;
  }
}