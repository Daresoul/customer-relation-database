/**
 * Base API service using Tauri's invoke functionality
 */

import { invoke } from '@tauri-apps/api/tauri';
import { ApiError, TauriError } from '../types/api';

export class ApiService {
  /**
   * Wrapper around Tauri's invoke with error handling
   */
  static async invoke<T>(command: string, args?: any): Promise<T> {
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