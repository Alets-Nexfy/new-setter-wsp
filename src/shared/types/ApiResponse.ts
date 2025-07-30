/**
 * Standard API Response Interface
 * Provides consistent response structure across all endpoints
 */

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  errors?: any[];
  timestamp: string;
  path?: string;
  statusCode?: number;
}

export class ApiResponseBuilder {
  /**
   * Create successful response
   */
  static success<T>(data?: T, message?: string): ApiResponse<T> {
    return {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create error response
   */
  static error(
    message: string, 
    statusCode: number = 500, 
    errors?: any[]
  ): ApiResponse {
    return {
      success: false,
      error: message,
      errors,
      statusCode,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create validation error response
   */
  static validationError(errors: any[]): ApiResponse {
    return {
      success: false,
      error: 'Validation failed',
      errors,
      statusCode: 400,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create not found response
   */
  static notFound(message: string = 'Resource not found'): ApiResponse {
    return {
      success: false,
      error: message,
      statusCode: 404,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create unauthorized response
   */
  static unauthorized(message: string = 'Unauthorized access'): ApiResponse {
    return {
      success: false,
      error: message,
      statusCode: 401,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create forbidden response
   */
  static forbidden(message: string = 'Access forbidden'): ApiResponse {
    return {
      success: false,
      error: message,
      statusCode: 403,
      timestamp: new Date().toISOString()
    };
  }
}

// Export both for convenience
export const ApiResponse = ApiResponseBuilder;