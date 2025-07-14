import { db } from '../config/firebase';
import { FirebaseFunction, FunctionStatus, CreateFirebaseFunctionDto, UpdateFirebaseFunctionDto } from '../types/firebaseFunction';
import { logger } from '../utils/logger';

export class FirebaseFunctionService {
  private readonly firebaseFunctionsCollection = 'firebaseFunctions';

  /**
   * Create a new Firebase function
   */
  async createFirebaseFunction(data: CreateFirebaseFunctionDto): Promise<FirebaseFunction> {
    try {
      const firebaseFunction: FirebaseFunction = {
        id: '',
        name: data.name,
        description: data.description || '',
        code: data.code,
        runtime: data.runtime || 'nodejs18',
        region: data.region || 'us-central1',
        memory: data.memory || '256MB',
        timeout: data.timeout || 60,
        triggers: data.triggers || [],
        environment: data.environment || {},
        isActive: data.isActive ?? true,
        version: 1,
        lastDeployed: null,
        deploymentStatus: FunctionStatus.DRAFT,
        errorCount: 0,
        executionCount: 0,
        avgExecutionTime: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const docRef = await db.collection(this.firebaseFunctionsCollection).add(firebaseFunction);
      firebaseFunction.id = docRef.id;

      await docRef.update({ id: docRef.id });

      logger.info(`Firebase function created: ${docRef.id} - ${data.name}`);
      return firebaseFunction;
    } catch (error) {
      logger.error('Error creating Firebase function:', error);
      throw new Error('Failed to create Firebase function');
    }
  }

  /**
   * Get Firebase function by ID
   */
  async getFirebaseFunction(functionId: string): Promise<FirebaseFunction | null> {
    try {
      const doc = await db.collection(this.firebaseFunctionsCollection).doc(functionId).get();
      
      if (!doc.exists) {
        return null;
      }

      return doc.data() as FirebaseFunction;
    } catch (error) {
      logger.error('Error getting Firebase function:', error);
      throw new Error('Failed to get Firebase function');
    }
  }

  /**
   * Get all Firebase functions
   */
  async getAllFirebaseFunctions(options: {
    isActive?: boolean;
    status?: FunctionStatus;
    region?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ functions: FirebaseFunction[]; total: number }> {
    try {
      let query = db.collection(this.firebaseFunctionsCollection)
        .orderBy('createdAt', 'desc');

      if (options.isActive !== undefined) {
        query = query.where('isActive', '==', options.isActive);
      }

      if (options.status) {
        query = query.where('deploymentStatus', '==', options.status);
      }

      if (options.region) {
        query = query.where('region', '==', options.region);
      }

      const snapshot = await query.get();
      const functions: FirebaseFunction[] = [];

      snapshot.forEach(doc => {
        functions.push(doc.data() as FirebaseFunction);
      });

      // Apply pagination
      const total = functions.length;
      const start = options.offset || 0;
      const end = start + (options.limit || 50);
      const paginatedFunctions = functions.slice(start, end);

      return {
        functions: paginatedFunctions,
        total
      };
    } catch (error) {
      logger.error('Error getting all Firebase functions:', error);
      throw new Error('Failed to get Firebase functions');
    }
  }

  /**
   * Update Firebase function
   */
  async updateFirebaseFunction(functionId: string, data: UpdateFirebaseFunctionDto): Promise<FirebaseFunction> {
    try {
      const updateData: Partial<FirebaseFunction> = {
        ...data,
        updatedAt: new Date()
      };

      // Increment version if code or configuration changes
      if (data.code || data.runtime || data.memory || data.timeout || data.triggers) {
        updateData.version = db.FieldValue.increment(1);
      }

      await db.collection(this.firebaseFunctionsCollection).doc(functionId).update(updateData);

      const updated = await db.collection(this.firebaseFunctionsCollection).doc(functionId).get();
      return updated.data() as FirebaseFunction;
    } catch (error) {
      logger.error('Error updating Firebase function:', error);
      throw new Error('Failed to update Firebase function');
    }
  }

  /**
   * Delete Firebase function
   */
  async deleteFirebaseFunction(functionId: string): Promise<void> {
    try {
      await db.collection(this.firebaseFunctionsCollection).doc(functionId).delete();
      logger.info(`Firebase function deleted: ${functionId}`);
    } catch (error) {
      logger.error('Error deleting Firebase function:', error);
      throw new Error('Failed to delete Firebase function');
    }
  }

  /**
   * Deploy Firebase function
   */
  async deployFunction(functionId: string): Promise<void> {
    try {
      const func = await this.getFirebaseFunction(functionId);
      
      if (!func) {
        throw new Error('Firebase function not found');
      }

      // Update deployment status
      await this.updateFirebaseFunction(functionId, {
        deploymentStatus: FunctionStatus.DEPLOYING,
        lastDeployed: new Date()
      });

      // Simulate deployment process (in real implementation, this would call Firebase CLI)
      logger.info(`Deploying function: ${func.name}`);
      
      // Update status to deployed after successful deployment
      await this.updateFirebaseFunction(functionId, {
        deploymentStatus: FunctionStatus.DEPLOYED
      });

      logger.info(`Function deployed successfully: ${func.name}`);
    } catch (error) {
      logger.error('Error deploying function:', error);
      
      // Update status to failed
      await this.updateFirebaseFunction(functionId, {
        deploymentStatus: FunctionStatus.FAILED
      });
      
      throw new Error('Failed to deploy function');
    }
  }

  /**
   * Undeploy Firebase function
   */
  async undeployFunction(functionId: string): Promise<void> {
    try {
      const func = await this.getFirebaseFunction(functionId);
      
      if (!func) {
        throw new Error('Firebase function not found');
      }

      // Update deployment status
      await this.updateFirebaseFunction(functionId, {
        deploymentStatus: FunctionStatus.UNDEPLOYING
      });

      // Simulate undeployment process
      logger.info(`Undeploying function: ${func.name}`);
      
      // Update status to draft after successful undeployment
      await this.updateFirebaseFunction(functionId, {
        deploymentStatus: FunctionStatus.DRAFT
      });

      logger.info(`Function undeployed successfully: ${func.name}`);
    } catch (error) {
      logger.error('Error undeploying function:', error);
      throw new Error('Failed to undeploy function');
    }
  }

  /**
   * Toggle function active status
   */
  async toggleFunctionActive(functionId: string): Promise<FirebaseFunction> {
    try {
      const func = await this.getFirebaseFunction(functionId);
      
      if (!func) {
        throw new Error('Firebase function not found');
      }

      return await this.updateFirebaseFunction(functionId, {
        isActive: !func.isActive
      });
    } catch (error) {
      logger.error('Error toggling function active status:', error);
      throw new Error('Failed to toggle function active status');
    }
  }

  /**
   * Get function execution logs
   */
  async getFunctionLogs(functionId: string, options: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  } = {}): Promise<any[]> {
    try {
      // In a real implementation, this would query Firebase Logging API
      // For now, return mock data
      const logs = [
        {
          timestamp: new Date(),
          level: 'INFO',
          message: 'Function executed successfully',
          executionTime: 150,
          memoryUsed: '128MB'
        }
      ];

      return logs.slice(0, options.limit || 100);
    } catch (error) {
      logger.error('Error getting function logs:', error);
      throw new Error('Failed to get function logs');
    }
  }

  /**
   * Get function statistics
   */
  async getFunctionStats(functionId: string): Promise<{
    totalExecutions: number;
    avgExecutionTime: number;
    errorRate: number;
    memoryUsage: string;
    lastExecution: Date | null;
  }> {
    try {
      const func = await this.getFirebaseFunction(functionId);
      
      if (!func) {
        throw new Error('Firebase function not found');
      }

      return {
        totalExecutions: func.executionCount,
        avgExecutionTime: func.avgExecutionTime,
        errorRate: func.executionCount > 0 ? (func.errorCount / func.executionCount) * 100 : 0,
        memoryUsage: func.memory,
        lastExecution: func.lastDeployed
      };
    } catch (error) {
      logger.error('Error getting function stats:', error);
      throw new Error('Failed to get function stats');
    }
  }

  /**
   * Get all function statistics
   */
  async getAllFunctionStats(): Promise<{
    totalFunctions: number;
    activeFunctions: number;
    deployedFunctions: number;
    totalExecutions: number;
    avgErrorRate: number;
    byRegion: Record<string, number>;
    byStatus: Record<string, number>;
  }> {
    try {
      const { functions } = await this.getAllFirebaseFunctions();
      
      const stats = {
        totalFunctions: 0,
        activeFunctions: 0,
        deployedFunctions: 0,
        totalExecutions: 0,
        avgErrorRate: 0,
        byRegion: {} as Record<string, number>,
        byStatus: {} as Record<string, number>
      };

      functions.forEach(func => {
        stats.totalFunctions++;
        stats.totalExecutions += func.executionCount;

        if (func.isActive) {
          stats.activeFunctions++;
        }

        if (func.deploymentStatus === FunctionStatus.DEPLOYED) {
          stats.deployedFunctions++;
        }

        stats.byRegion[func.region] = (stats.byRegion[func.region] || 0) + 1;
        stats.byStatus[func.deploymentStatus] = (stats.byStatus[func.deploymentStatus] || 0) + 1;
      });

      if (stats.totalFunctions > 0) {
        const totalErrors = functions.reduce((sum, func) => sum + func.errorCount, 0);
        stats.avgErrorRate = (totalErrors / stats.totalExecutions) * 100;
      }

      return stats;
    } catch (error) {
      logger.error('Error getting all function stats:', error);
      throw new Error('Failed to get all function stats');
    }
  }

  /**
   * Validate function code
   */
  async validateFunctionCode(code: string, runtime: string): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    try {
      const errors: string[] = [];
      const warnings: string[] = [];

      // Basic validation
      if (!code.trim()) {
        errors.push('Function code cannot be empty');
      }

      if (code.length > 1000000) { // 1MB limit
        errors.push('Function code exceeds size limit');
      }

      // Check for common issues
      if (!code.includes('exports.')) {
        warnings.push('No exports found - function may not be callable');
      }

      if (code.includes('console.log') && !code.includes('logger')) {
        warnings.push('Consider using structured logging instead of console.log');
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      logger.error('Error validating function code:', error);
      throw new Error('Failed to validate function code');
    }
  }
} 