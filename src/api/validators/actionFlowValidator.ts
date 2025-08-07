import { Request, Response, NextFunction } from 'express';
import { CreateActionFlowRequest, UpdateActionFlowRequest, ActionFlowStep } from '../../core/models/ActionFlow';

/**
 * Validate action flow data for creation and updates
 */
export const validateActionFlow = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const flowData = req.body as CreateActionFlowRequest | UpdateActionFlowRequest;
    const errors: string[] = [];

    // Validate name
    if (flowData.name !== undefined) {
      if (!flowData.name || flowData.name.trim() === '') {
        errors.push('Action flow name is required');
      } else if (flowData.name.length > 100) {
        errors.push('Action flow name is too long (max 100 characters)');
      }
    }

    // Validate description
    if (flowData.description !== undefined) {
      if (flowData.description && flowData.description.length > 1000) {
        errors.push('Action flow description is too long (max 1000 characters)');
      }
    }

    // Validate trigger
    if (flowData.trigger) {
      if (!flowData.trigger.text || flowData.trigger.text.trim() === '') {
        errors.push('Trigger text is required');
      } else if (flowData.trigger.text.length > 500) {
        errors.push('Trigger text is too long (max 500 characters)');
      }

      if (!flowData.trigger.type) {
        errors.push('Trigger type is required');
      } else {
        const validTypes = ['contains', 'exact', 'starts_with'];
        if (!validTypes.includes(flowData.trigger.type)) {
          errors.push(`Invalid trigger type. Must be one of: ${validTypes.join(', ')}`);
        }
      }

      if (flowData.trigger.description && flowData.trigger.description.length > 1000) {
        errors.push('Trigger description is too long (max 1000 characters)');
      }
    }

    // Validate steps
    if (flowData.steps) {
      if (!Array.isArray(flowData.steps) || flowData.steps.length === 0) {
        errors.push('Action flow must have at least one step');
      } else {
        for (let i = 0; i < flowData.steps.length; i++) {
          const stepErrors = validateStep(flowData.steps[i], i);
          errors.push(...stepErrors);
        }
      }
    }

    // Validate priority
    if (flowData.priority !== undefined) {
      if (typeof flowData.priority !== 'number' || flowData.priority < 1 || flowData.priority > 100) {
        errors.push('Priority must be a number between 1 and 100');
      }
    }

    // Validate conditions
    if (flowData.conditions) {
      // Validate time range
      if (flowData.conditions.timeRange) {
        const { start, end } = flowData.conditions.timeRange;
        if (!start || !end) {
          errors.push('Time range must have both start and end times');
        } else {
          // Validate time format (HH:MM)
          const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
          if (!timeRegex.test(start) || !timeRegex.test(end)) {
            errors.push('Time range must be in HH:MM format');
          }
        }
      }

      // Validate day of week
      if (flowData.conditions.dayOfWeek) {
        if (!Array.isArray(flowData.conditions.dayOfWeek)) {
          errors.push('Day of week must be an array');
        } else {
          const validDays = [0, 1, 2, 3, 4, 5, 6]; // Sunday = 0
          for (const day of flowData.conditions.dayOfWeek) {
            if (!validDays.includes(day)) {
              errors.push('Invalid day of week. Must be 0-6 (Sunday = 0)');
              break;
            }
          }
        }
      }

      // Validate user tags
      if (flowData.conditions.userTags) {
        if (!Array.isArray(flowData.conditions.userTags)) {
          errors.push('User tags must be an array');
        } else {
          for (const tag of flowData.conditions.userTags) {
            if (typeof tag !== 'string' || tag.length > 50) {
              errors.push('User tags must be strings with max 50 characters');
              break;
            }
          }
        }
      }

      // Validate chat tags
      if (flowData.conditions.chatTags) {
        if (!Array.isArray(flowData.conditions.chatTags)) {
          errors.push('Chat tags must be an array');
        } else {
          for (const tag of flowData.conditions.chatTags) {
            if (typeof tag !== 'string' || tag.length > 50) {
              errors.push('Chat tags must be strings with max 50 characters');
              break;
            }
          }
        }
      }
    }

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
      return;
    }

    next();
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Invalid request data',
      error: error.message
    });
  }
};

/**
 * Validate a single action flow step
 */
function validateStep(step: ActionFlowStep, index: number): string[] {
  const errors: string[] = [];
  const validStepTypes = [
    'send_message',
    'send_media',
    'send_template',
    'add_tag',
    'remove_tag',
    'move_to_kanban',
    'create_kanban_card',
    'update_kanban_card',
    'send_notification',
    'wait',
    'condition',
    'loop',
    'http_request',
    'database_query',
    'custom_function'
  ];

  // Validate step type
  if (!step.type || !validStepTypes.includes(step.type)) {
    errors.push(`Step ${index + 1}: Invalid step type. Must be one of: ${validStepTypes.join(', ')}`);
  }

  // Validate step name
  if (!step.name || step.name.trim() === '') {
    errors.push(`Step ${index + 1}: Step name is required`);
  } else if (step.name.length > 100) {
    errors.push(`Step ${index + 1}: Step name is too long (max 100 characters)`);
  }

  // Validate step order
  if (step.order !== undefined && (typeof step.order !== 'number' || step.order < 0)) {
    errors.push(`Step ${index + 1}: Order must be a non-negative number`);
  }

  // Validate step-specific properties
  switch (step.type) {
    case 'send_message':
    case 'send_media':
    case 'send_template':
      if (!step.value || typeof step.value !== 'string') {
        errors.push(`Step ${index + 1} (${step.type}): value is required and must be a string`);
      } else if (step.value.length > 2000) {
        errors.push(`Step ${index + 1} (${step.type}): value is too long (max 2000 characters)`);
      }
      break;

    case 'add_tag':
    case 'remove_tag':
      if (!step.value || typeof step.value !== 'string') {
        errors.push(`Step ${index + 1} (${step.type}): tag name is required`);
      } else if (step.value.length > 50) {
        errors.push(`Step ${index + 1} (${step.type}): tag name is too long (max 50 characters)`);
      }
      break;

    case 'move_to_kanban':
    case 'create_kanban_card':
    case 'update_kanban_card':
      if (!step.value || typeof step.value !== 'object') {
        errors.push(`Step ${index + 1} (${step.type}): kanban configuration is required`);
      }
      break;

    case 'wait':
      if (!step.value || typeof step.value !== 'number' || step.value < 0) {
        errors.push(`Step ${index + 1} (wait): duration must be a positive number`);
      } else if (step.value > 300000) { // 5 minutes max
        errors.push(`Step ${index + 1} (wait): duration cannot exceed 5 minutes (300000ms)`);
      }
      break;

    case 'condition':
      if (!step.condition || typeof step.condition !== 'object') {
        errors.push(`Step ${index + 1} (condition): condition object is required`);
      } else {
        // Validate condition structure
        const condition = step.condition as any;
        if (!condition.operator || !condition.value) {
          errors.push(`Step ${index + 1} (condition): condition must have operator and value`);
        }
      }
      break;

    case 'http_request':
      if (!step.value || typeof step.value !== 'object') {
        errors.push(`Step ${index + 1} (http_request): request configuration is required`);
      } else {
        const config = step.value as any;
        if (!config.url || !config.method) {
          errors.push(`Step ${index + 1} (http_request): URL and method are required`);
        }
      }
      break;

    case 'database_query':
      if (!step.value || typeof step.value !== 'object') {
        errors.push(`Step ${index + 1} (database_query): query configuration is required`);
      }
      break;

    case 'custom_function':
      if (!step.value || typeof step.value !== 'string') {
        errors.push(`Step ${index + 1} (custom_function): function name is required`);
      }
      break;
  }

  // Validate step description
  if (step.description && step.description.length > 500) {
    errors.push(`Step ${index + 1}: Description is too long (max 500 characters)`);
  }

  return errors;
}

/**
 * Validate bulk operations request
 */
export const validateBulkOperations = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { operation, flowIds, data } = req.body;
    const errors: string[] = [];

    // Validate operation
    const validOperations = ['activate', 'deactivate', 'delete', 'execute'];
    if (!operation || !validOperations.includes(operation)) {
      errors.push(`Invalid operation. Must be one of: ${validOperations.join(', ')}`);
    }

    // Validate flow IDs
    if (!flowIds || !Array.isArray(flowIds) || flowIds.length === 0) {
      errors.push('Flow IDs must be a non-empty array');
    } else {
      if (flowIds.length > 50) {
        errors.push('Cannot process more than 50 flows at once');
      }
      for (const flowId of flowIds) {
        if (typeof flowId !== 'string' || flowId.trim() === '') {
          errors.push('All flow IDs must be non-empty strings');
          break;
        }
      }
    }

    // Validate data for execute operation
    if (operation === 'execute' && data) {
      if (typeof data !== 'object') {
        errors.push('Execute operation data must be an object');
      }
    }

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
      return;
    }

    next();
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Invalid request data',
      error: error.message
    });
  }
};

/**
 * Validate flow ID parameter
 */
export const validateFlowId = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { flowId } = req.params;
    
    if (!flowId || typeof flowId !== 'string' || flowId.trim() === '') {
      res.status(400).json({
        success: false,
        message: 'Valid flow ID is required'
      });
      return;
    }

    next();
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Invalid flow ID',
      error: error.message
    });
  }
};

/**
 * Validate execution context
 */
export const validateExecutionContext = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { context } = req.body;
    const errors: string[] = [];

    if (context && typeof context !== 'object') {
      errors.push('Context must be an object');
    }

    if (context && context.chatId && typeof context.chatId !== 'string') {
      errors.push('Context chatId must be a string');
    }

    if (context && context.userId && typeof context.userId !== 'string') {
      errors.push('Context userId must be a string');
    }

    if (context && context.variables && typeof context.variables !== 'object') {
      errors.push('Context variables must be an object');
    }

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
      return;
    }

    next();
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Invalid request data',
      error: error.message
    });
  }
};

// Default export
const actionFlowValidator = {
  validateActionFlow,
  validateBulkOperations,
  validateFlowId,
  validateExecutionContext
};

export default actionFlowValidator; 