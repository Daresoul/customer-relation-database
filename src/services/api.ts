/**
 * Base API service using Tauri's invoke functionality
 * Handles automatic case transformation between frontend (camelCase) and backend (snake_case)
 */

import { invoke } from '@tauri-apps/api/tauri';
import { ApiError, TauriError } from '../types/api';
import { camelToSnakeObject, snakeToCamelObject } from '../utils/caseTransform';

export class ApiService {
  /**
   * Wrapper around Tauri's invoke with error handling and automatic case transformation
   * - Converts args from camelCase to snake_case before sending
   * - Converts response from snake_case to camelCase after receiving
   */
  static async invoke<T>(command: string, args?: any): Promise<T> {
    try {
      // Transform args from camelCase to snake_case for backend
      const transformedArgs = args ? camelToSnakeObject(args) : undefined;
      const result = await invoke<any>(command, transformedArgs);
      // Transform response from snake_case to camelCase for frontend
      return snakeToCamelObject(result) as T;
    } catch (error) {
      console.error(`Tauri command failed: ${command}`, error);
      throw this.handleError(error);
    }
  }

  /**
   * Raw invoke without case transformation - use when you need exact control
   */
  static async invokeRaw<T>(command: string, args?: any): Promise<T> {
    try {
      const result = await invoke<T>(command, args);
      return result;
    } catch (error) {
      console.error(`Tauri command failed: ${command}`, error);
      throw this.handleError(error);
    }
  }

  /**
   * Handle and normalize errors from Tauri commands
   */
  private static handleError(error: any): ApiError {
    if (typeof error === 'string') {
      return {
        message: error,
        code: 'UNKNOWN_ERROR'
      };
    }

    if (error && typeof error === 'object') {
      // Handle Tauri error format
      if (error.message) {
        return {
          message: error.message,
          code: error.code || 'TAURI_ERROR',
          details: error.details
        };
      }

      // Handle generic error objects
      if (error.toString) {
        return {
          message: error.toString(),
          code: 'GENERIC_ERROR'
        };
      }
    }

    return {
      message: 'An unknown error occurred',
      code: 'UNKNOWN_ERROR'
    };
  }

  /**
   * Check if an error is a specific type
   */
  static isApiError(error: any): error is ApiError {
    return error && typeof error === 'object' && 'message' in error;
  }

  /**
   * Create a standardized API error
   */
  static createError(message: string, code?: string, details?: any): ApiError {
    return {
      message,
      code: code || 'API_ERROR',
      details
    };
  }
}

export default ApiService;