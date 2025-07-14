import { Request, Response } from 'express';
import { FirebaseFunctionService } from '../../core/services/firebaseFunctionService';
import { logger } from '../../core/utils/logger';

export class FirebaseFunctionController {
  private firebaseFunctionService: FirebaseFunctionService;

  constructor() {
    this.firebaseFunctionService = new FirebaseFunctionService();
  }

  /**
   * Create Firebase function
   */
  createFirebaseFunction = async (req: Request, res: Response): Promise<void> => {
    try {
      const firebaseFunction = await this.firebaseFunctionService.createFirebaseFunction(req.body);
      
      res.status(201).json({
        success: true,
        data: firebaseFunction,
        message: 'Firebase function created successfully'
      });
    } catch (error) {
      logger.error('Error in createFirebaseFunction controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create Firebase function'
      });
    }
  };

  /**
   * Get Firebase function by ID
   */
  getFirebaseFunction = async (req: Request, res: Response): Promise<void> => {
    try {
      const { functionId } = req.params;
      const firebaseFunction = await this.firebaseFunctionService.getFirebaseFunction(functionId);
      
      if (!firebaseFunction) {
        res.status(404).json({
          success: false,
          message: 'Firebase function not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: firebaseFunction,
        message: 'Firebase function retrieved successfully'
      });
    } catch (error) {
      logger.error('Error in getFirebaseFunction controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get Firebase function'
      });
    }
  };

  /**
   * Get all Firebase functions
   */
  getAllFirebaseFunctions = async (req: Request, res: Response): Promise<void> => {
    try {
      const { isActive, status, region, limit, offset } = req.query;

      const options = {
        isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
        status: status as any,
        region: region as string,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined
      };

      const result = await this.firebaseFunctionService.getAllFirebaseFunctions(options);
      
      res.status(200).json({
        success: true,
        data: result,
        message: 'Firebase functions retrieved successfully'
      });
    } catch (error) {
      logger.error('Error in getAllFirebaseFunctions controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get Firebase functions'
      });
    }
  };

  /**
   * Update Firebase function
   */
  updateFirebaseFunction = async (req: Request, res: Response): Promise<void> => {
    try {
      const { functionId } = req.params;
      const firebaseFunction = await this.firebaseFunctionService.updateFirebaseFunction(functionId, req.body);
      
      res.status(200).json({
        success: true,
        data: firebaseFunction,
        message: 'Firebase function updated successfully'
      });
    } catch (error) {
      logger.error('Error in updateFirebaseFunction controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update Firebase function'
      });
    }
  };

  /**
   * Delete Firebase function
   */
  deleteFirebaseFunction = async (req: Request, res: Response): Promise<void> => {
    try {
      const { functionId } = req.params;
      await this.firebaseFunctionService.deleteFirebaseFunction(functionId);
      
      res.status(200).json({
        success: true,
        message: 'Firebase function deleted successfully'
      });
    } catch (error) {
      logger.error('Error in deleteFirebaseFunction controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete Firebase function'
      });
    }
  };

  /**
   * Deploy Firebase function
   */
  deployFunction = async (req: Request, res: Response): Promise<void> => {
    try {
      const { functionId } = req.params;
      await this.firebaseFunctionService.deployFunction(functionId);
      
      res.status(200).json({
        success: true,
        message: 'Firebase function deployed successfully'
      });
    } catch (error) {
      logger.error('Error in deployFunction controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to deploy Firebase function'
      });
    }
  };

  /**
   * Undeploy Firebase function
   */
  undeployFunction = async (req: Request, res: Response): Promise<void> => {
    try {
      const { functionId } = req.params;
      await this.firebaseFunctionService.undeployFunction(functionId);
      
      res.status(200).json({
        success: true,
        message: 'Firebase function undeployed successfully'
      });
    } catch (error) {
      logger.error('Error in undeployFunction controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to undeploy Firebase function'
      });
    }
  };

  /**
   * Toggle function active status
   */
  toggleFunctionActive = async (req: Request, res: Response): Promise<void> => {
    try {
      const { functionId } = req.params;
      const firebaseFunction = await this.firebaseFunctionService.toggleFunctionActive(functionId);
      
      res.status(200).json({
        success: true,
        data: firebaseFunction,
        message: 'Function active status toggled successfully'
      });
    } catch (error) {
      logger.error('Error in toggleFunctionActive controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to toggle function active status'
      });
    }
  };

  /**
   * Get function logs
   */
  getFunctionLogs = async (req: Request, res: Response): Promise<void> => {
    try {
      const { functionId } = req.params;
      const { startDate, endDate, limit } = req.query;

      const options = {
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined
      };

      const logs = await this.firebaseFunctionService.getFunctionLogs(functionId, options);
      
      res.status(200).json({
        success: true,
        data: logs,
        message: 'Function logs retrieved successfully'
      });
    } catch (error) {
      logger.error('Error in getFunctionLogs controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get function logs'
      });
    }
  };

  /**
   * Get function statistics
   */
  getFunctionStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const { functionId } = req.params;
      const stats = await this.firebaseFunctionService.getFunctionStats(functionId);
      
      res.status(200).json({
        success: true,
        data: stats,
        message: 'Function statistics retrieved successfully'
      });
    } catch (error) {
      logger.error('Error in getFunctionStats controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get function statistics'
      });
    }
  };

  /**
   * Get all function statistics
   */
  getAllFunctionStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = await this.firebaseFunctionService.getAllFunctionStats();
      
      res.status(200).json({
        success: true,
        data: stats,
        message: 'All function statistics retrieved successfully'
      });
    } catch (error) {
      logger.error('Error in getAllFunctionStats controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get all function statistics'
      });
    }
  };

  /**
   * Validate function code
   */
  validateFunctionCode = async (req: Request, res: Response): Promise<void> => {
    try {
      const { code, runtime } = req.body;
      const validation = await this.firebaseFunctionService.validateFunctionCode(code, runtime);
      
      res.status(200).json({
        success: true,
        data: validation,
        message: 'Function code validation completed'
      });
    } catch (error) {
      logger.error('Error in validateFunctionCode controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to validate function code'
      });
    }
  };
} 