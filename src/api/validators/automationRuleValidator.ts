import { Request, Response, NextFunction } from 'express';
import { CreateAutomationRuleRequest, UpdateAutomationRuleRequest } from '../../core/models/AutomationRule';

/**
 * Validate automation rule data for creation and updates
 */
export const validateAutomationRule = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const ruleData = req.body as CreateAutomationRuleRequest | UpdateAutomationRuleRequest;
    const errors: string[] = [];

    // Validate trigger
    if (ruleData.trigger) {
      if (!ruleData.trigger.text || ruleData.trigger.text.trim() === '') {
        errors.push('Trigger text is required');
      } else if (ruleData.trigger.text.length > 500) {
        errors.push('Trigger text is too long (max 500 characters)');
      }

      if (!ruleData.trigger.type) {
        errors.push('Trigger type is required');
      } else {
        const validTypes = ['contains', 'exact', 'starts_with'];
        if (!validTypes.includes(ruleData.trigger.type)) {
          errors.push(`Invalid trigger type. Must be one of: ${validTypes.join(', ')}`);
        }
      }

      if (ruleData.trigger.description && ruleData.trigger.description.length > 1000) {
        errors.push('Trigger description is too long (max 1000 characters)');
      }
    }

    // Validate response
    if (ruleData.response) {
      if (!ruleData.response.text || ruleData.response.text.trim() === '') {
        errors.push('Response text is required');
      } else if (ruleData.response.text.length > 2000) {
        errors.push('Response text is too long (max 2000 characters)');
      }

      if (!ruleData.response.type) {
        errors.push('Response type is required');
      } else {
        const validTypes = ['text', 'media', 'template'];
        if (!validTypes.includes(ruleData.response.type)) {
          errors.push(`Invalid response type. Must be one of: ${validTypes.join(', ')}`);
        }
      }

      // Validate media response
      if (ruleData.response.type === 'media' && !ruleData.response.mediaUrl) {
        errors.push('Media URL is required for media response type');
      }

      // Validate template response
      if (ruleData.response.type === 'template' && !ruleData.response.templateName) {
        errors.push('Template name is required for template response type');
      }
    }

    // Validate name
    if (ruleData.name !== undefined) {
      if (ruleData.name.length > 100) {
        errors.push('Rule name is too long (max 100 characters)');
      }
    }

    // Validate description
    if (ruleData.description !== undefined) {
      if (ruleData.description.length > 1000) {
        errors.push('Rule description is too long (max 1000 characters)');
      }
    }

    // Validate priority
    if (ruleData.priority !== undefined) {
      if (typeof ruleData.priority !== 'number' || ruleData.priority < 1 || ruleData.priority > 100) {
        errors.push('Priority must be a number between 1 and 100');
      }
    }

    // Validate conditions
    if (ruleData.conditions) {
      // Validate time range
      if (ruleData.conditions.timeRange) {
        const { start, end } = ruleData.conditions.timeRange;
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
      if (ruleData.conditions.dayOfWeek) {
        if (!Array.isArray(ruleData.conditions.dayOfWeek)) {
          errors.push('Day of week must be an array');
        } else {
          const validDays = [0, 1, 2, 3, 4, 5, 6]; // Sunday = 0
          for (const day of ruleData.conditions.dayOfWeek) {
            if (!validDays.includes(day)) {
              errors.push('Invalid day of week. Must be 0-6 (Sunday = 0)');
              break;
            }
          }
        }
      }

      // Validate user tags
      if (ruleData.conditions.userTags) {
        if (!Array.isArray(ruleData.conditions.userTags)) {
          errors.push('User tags must be an array');
        } else {
          for (const tag of ruleData.conditions.userTags) {
            if (typeof tag !== 'string' || tag.length > 50) {
              errors.push('User tags must be strings with max 50 characters');
              break;
            }
          }
        }
      }

      // Validate chat tags
      if (ruleData.conditions.chatTags) {
        if (!Array.isArray(ruleData.conditions.chatTags)) {
          errors.push('Chat tags must be an array');
        } else {
          for (const tag of ruleData.conditions.chatTags) {
            if (typeof tag !== 'string' || tag.length > 50) {
              errors.push('Chat tags must be strings with max 50 characters');
              break;
            }
          }
        }
      }
    }

    // Validate variables for template responses
    if (ruleData.response?.type === 'template' && ruleData.response.variables) {
      if (typeof ruleData.response.variables !== 'object') {
        errors.push('Template variables must be an object');
      } else {
        for (const [key, value] of Object.entries(ruleData.response.variables)) {
          if (typeof key !== 'string' || key.length > 50) {
            errors.push('Template variable keys must be strings with max 50 characters');
            break;
          }
          if (typeof value !== 'string' || value.length > 200) {
            errors.push('Template variable values must be strings with max 200 characters');
            break;
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
 * Validate bulk operations request
 */
export const validateBulkOperations = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { operation, ruleIds, data } = req.body;
    const errors: string[] = [];

    // Validate operation
    const validOperations = ['activate', 'deactivate', 'delete'];
    if (!operation || !validOperations.includes(operation)) {
      errors.push(`Invalid operation. Must be one of: ${validOperations.join(', ')}`);
    }

    // Validate rule IDs
    if (!ruleIds || !Array.isArray(ruleIds) || ruleIds.length === 0) {
      errors.push('Rule IDs must be a non-empty array');
    } else {
      if (ruleIds.length > 100) {
        errors.push('Cannot process more than 100 rules at once');
      }
      for (const ruleId of ruleIds) {
        if (typeof ruleId !== 'string' || ruleId.trim() === '') {
          errors.push('All rule IDs must be non-empty strings');
          break;
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
 * Validate rule ID parameter
 */
export const validateRuleId = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { ruleId } = req.params;
    
    if (!ruleId || typeof ruleId !== 'string' || ruleId.trim() === '') {
      res.status(400).json({
        success: false,
        message: 'Valid rule ID is required'
      });
      return;
    }

    next();
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Invalid rule ID',
      error: error.message
    });
  }
}; 