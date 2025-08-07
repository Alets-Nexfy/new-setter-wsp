import { SupabaseService } from './SupabaseService';
import { LoggerService } from './LoggerService';
import { FirebaseFunction, FunctionStatus, CreateFirebaseFunctionDto, UpdateFirebaseFunctionDto } from '../types/firebaseFunction';

export class FirebaseFunctionService {
  private static instance: FirebaseFunctionService;
  private db: SupabaseService;
  private logger: LoggerService;
  private readonly tableName = 'cloud_functions';

  private constructor() {
    this.db = SupabaseService.getInstance();
    this.logger = LoggerService.getInstance();
  }

  static getInstance(): FirebaseFunctionService {
    if (!FirebaseFunctionService.instance) {
      FirebaseFunctionService.instance = new FirebaseFunctionService();
    }
    return FirebaseFunctionService.instance;
  }

  /**
   * Create a new cloud function
   */
  async createFirebaseFunction(data: CreateFirebaseFunctionDto): Promise<FirebaseFunction> {
    try {
      const { data: result, error } = await this.db
        .from(this.tableName)
        .insert({
          name: data.name,
          description: data.description,
          code: data.code,
          runtime: data.runtime,
          region: data.region || 'us-central1',
          memory: data.memory || '256MB',
          timeout: data.timeout || 60,
          triggers: data.triggers || [],
          environment: data.environment || {},
          is_active: data.isActive ?? true,
          version: 1,
          deployment_status: FunctionStatus.DRAFT,
          error_count: 0,
          execution_count: 0,
          avg_execution_time: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      const cloudFunction = this.mapFromDatabase(result);
      this.logger.info(`Cloud function created: ${cloudFunction.id}`);
      return cloudFunction;
    } catch (error) {
      this.logger.error('Error creating cloud function:', error);
      throw new Error('Failed to create cloud function');
    }
  }

  /**
   * Get all cloud functions
   */
  async getFirebaseFunctions(): Promise<FirebaseFunction[]> {
    try {
      const { data, error } = await this.db
        .from(this.tableName)
        .select('*');

      if (error) throw error;

      return data.map(item => this.mapFromDatabase(item));
    } catch (error) {
      this.logger.error('Error getting cloud functions:', error);
      throw new Error('Failed to get cloud functions');
    }
  }

  /**
   * Update a cloud function
   */
  async updateFirebaseFunction(functionId: string, data: UpdateFirebaseFunctionDto): Promise<FirebaseFunction | null> {
    try {
      const updateData = this.mapToDatabase(data);
      
      // Increment version if code changes
      if (data.code) {
        const current = await this.getFirebaseFunction(functionId);
        if (current) {
          updateData.version = current.version + 1;
        }
      }

      const { error } = await this.db
        .from(this.tableName)
        .update({
          ...updateData,
          updated_at: new Date().toISOString()
        })
        .eq('id', functionId);

      if (error) throw error;

      return await this.getFirebaseFunction(functionId);
    } catch (error) {
      this.logger.error('Error updating cloud function:', error);
      throw new Error('Failed to update cloud function');
    }
  }

  /**
   * Get a specific cloud function
   */
  async getFirebaseFunction(functionId: string): Promise<FirebaseFunction | null> {
    try {
      const { data, error } = await this.db
        .from(this.tableName)
        .select('*')
        .eq('id', functionId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }

      return this.mapFromDatabase(data);
    } catch (error) {
      this.logger.error('Error getting cloud function:', error);
      return null;
    }
  }

  /**
   * Delete a cloud function
   */
  async deleteFirebaseFunction(functionId: string): Promise<void> {
    try {
      const { error } = await this.db
        .from(this.tableName)
        .delete()
        .eq('id', functionId);

      if (error) throw error;
      this.logger.info(`Cloud function deleted: ${functionId}`);
    } catch (error) {
      this.logger.error('Error deleting cloud function:', error);
      throw new Error('Failed to delete cloud function');
    }
  }

  /**
   * Deploy function (simplified for Supabase)
   */
  async deployFunction(functionId: string): Promise<void> {
    try {
      await this.db
        .from(this.tableName)
        .update({
          deployment_status: FunctionStatus.DEPLOYED,
          last_deployed: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', functionId);

      this.logger.info(`Function deployed: ${functionId}`);
    } catch (error) {
      this.logger.error('Error deploying function:', error);
      throw error;
    }
  }

  private mapFromDatabase(data: any): FirebaseFunction {
    return {
      id: data.id,
      name: data.name,
      description: data.description,
      code: data.code,
      runtime: data.runtime,
      region: data.region,
      memory: data.memory,
      timeout: data.timeout,
      triggers: data.triggers,
      environment: data.environment,
      isActive: data.is_active,
      version: data.version,
      lastDeployed: data.last_deployed ? new Date(data.last_deployed) : null,
      deploymentStatus: data.deployment_status,
      errorCount: data.error_count,
      executionCount: data.execution_count,
      avgExecutionTime: data.avg_execution_time,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    };
  }

  async undeployFunction(functionId: string): Promise<void> {
    try {
      await this.db
        .from(this.tableName)
        .update({
          deployment_status: FunctionStatus.DRAFT,
          updated_at: new Date().toISOString()
        })
        .eq('id', functionId);

      this.logger.info(`Function undeployed: ${functionId}`);
    } catch (error) {
      this.logger.error('Error undeploying function:', error);
      throw error;
    }
  }

  async toggleFunctionActive(functionId: string): Promise<FirebaseFunction | null> {
    try {
      const func = await this.getFirebaseFunction(functionId);
      if (!func) return null;

      await this.db
        .from(this.tableName)
        .update({
          is_active: !func.isActive,
          updated_at: new Date().toISOString()
        })
        .eq('id', functionId);

      return await this.getFirebaseFunction(functionId);
    } catch (error) {
      this.logger.error('Error toggling function active:', error);
      throw error;
    }
  }

  async getFunctionLogs(functionId: string): Promise<any[]> {
    try {
      // Placeholder implementation for logs
      return [];
    } catch (error) {
      this.logger.error('Error getting function logs:', error);
      throw error;
    }
  }

  async getFunctionStats(functionId: string): Promise<any> {
    try {
      const func = await this.getFirebaseFunction(functionId);
      if (!func) return null;

      return {
        executionCount: func.executionCount,
        errorCount: func.errorCount,
        avgExecutionTime: func.avgExecutionTime,
        lastExecuted: func.lastDeployed
      };
    } catch (error) {
      this.logger.error('Error getting function stats:', error);
      throw error;
    }
  }

  async getAllFunctionStats(): Promise<any> {
    try {
      const functions = await this.getFirebaseFunctions();
      return {
        totalFunctions: functions.length,
        activeFunctions: functions.filter(f => f.isActive).length,
        deployedFunctions: functions.filter(f => f.deploymentStatus === FunctionStatus.DEPLOYED).length
      };
    } catch (error) {
      this.logger.error('Error getting all function stats:', error);
      throw error;
    }
  }

  async validateFunctionCode(code: string): Promise<{ valid: boolean; errors: string[] }> {
    try {
      // Basic validation placeholder
      const errors: string[] = [];
      if (!code || code.trim().length === 0) {
        errors.push('Function code cannot be empty');
      }
      
      return {
        valid: errors.length === 0,
        errors
      };
    } catch (error) {
      this.logger.error('Error validating function code:', error);
      return { valid: false, errors: ['Validation failed'] };
    }
  }

  private mapToDatabase(data: UpdateFirebaseFunctionDto): any {
    const dbData: any = {};
    if (data.name !== undefined) dbData.name = data.name;
    if (data.description !== undefined) dbData.description = data.description;
    if (data.code !== undefined) dbData.code = data.code;
    if (data.runtime !== undefined) dbData.runtime = data.runtime;
    if (data.region !== undefined) dbData.region = data.region;
    if (data.memory !== undefined) dbData.memory = data.memory;
    if (data.timeout !== undefined) dbData.timeout = data.timeout;
    if (data.triggers !== undefined) dbData.triggers = data.triggers;
    if (data.environment !== undefined) dbData.environment = data.environment;
    if (data.isActive !== undefined) dbData.is_active = data.isActive;
    return dbData;
  }
}