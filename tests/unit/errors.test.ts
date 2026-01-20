/**
 * Unit Tests for Error Handling Utility
 * Tests for error classes, extraction, normalization, and handlers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  // Error Classes
  AppBaseError,
  ApiError,
  NetworkError,
  ValidationError,
  AuthError,
  PermissionError,
  NotFoundError,
  TimeoutError,
  // Extraction & Normalization
  extractErrorMessage,
  normalizeError,
  // User-friendly messages
  getErrorTranslationKey,
  getUserFriendlyMessage,
  // Error handlers
  handleError,
  createErrorHandler,
  createMutationErrorHandler,
  // Type guards
  isNetworkError,
  isAuthError,
  isNotFoundError,
  isValidationError,
  isErrorCategory,
  // Reporter
  setErrorReporter,
  getErrorReporter,
  // Types
  type AppError,
  type ErrorCategory,
} from '../../src/utils/errors';

describe('Error Utility', () => {
  // ============================================================================
  // Custom Error Classes
  // ============================================================================

  describe('AppBaseError', () => {
    it('creates error with default values', () => {
      const error = new AppBaseError('Test error');

      expect(error.message).toBe('Test error');
      expect(error.name).toBe('AppBaseError');
      expect(error.category).toBe('unknown');
      expect(error.severity).toBe('error');
      expect(error.shouldReport).toBe(true);
      expect(error.shouldDisplay).toBe(true);
      expect(error.timestamp).toBeDefined();
    });

    it('creates error with custom options', () => {
      const error = new AppBaseError('Custom error', {
        category: 'api',
        severity: 'critical',
        statusCode: 500,
        code: 'SERVER_ERROR',
        context: { source: 'TestComponent' },
        shouldReport: false,
        shouldDisplay: false,
      });

      expect(error.category).toBe('api');
      expect(error.severity).toBe('critical');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('SERVER_ERROR');
      expect(error.context?.source).toBe('TestComponent');
      expect(error.shouldReport).toBe(false);
      expect(error.shouldDisplay).toBe(false);
    });

    it('converts to AppError structure', () => {
      const error = new AppBaseError('Test error', {
        category: 'validation',
        severity: 'warning',
        code: 'VALIDATION_ERROR',
      });

      const appError = error.toAppError();

      expect(appError.message).toBe('Test error');
      expect(appError.category).toBe('validation');
      expect(appError.severity).toBe('warning');
      expect(appError.code).toBe('VALIDATION_ERROR');
      expect(appError.originalError).toBe(error);
    });

    it('is instance of Error', () => {
      const error = new AppBaseError('Test');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppBaseError);
    });
  });

  describe('ApiError', () => {
    it('categorizes by status code - 401', () => {
      const error = new ApiError('Unauthorized', 401);
      expect(error.category).toBe('auth');
      expect(error.severity).toBe('error');
      expect(error.shouldReport).toBe(false);
    });

    it('categorizes by status code - 403', () => {
      const error = new ApiError('Forbidden', 403);
      expect(error.category).toBe('permission');
    });

    it('categorizes by status code - 404', () => {
      const error = new ApiError('Not found', 404);
      expect(error.category).toBe('notFound');
    });

    it('categorizes by status code - 500', () => {
      const error = new ApiError('Server error', 500);
      expect(error.category).toBe('api');
      expect(error.severity).toBe('critical');
      expect(error.shouldReport).toBe(true);
    });

    it('categorizes by status code - 409 conflict', () => {
      const error = new ApiError('Conflict', 409);
      expect(error.category).toBe('conflict');
    });

    it('defaults to unknown category without status code', () => {
      const error = new ApiError('Unknown error');
      expect(error.category).toBe('unknown');
      expect(error.shouldReport).toBe(true);
    });
  });

  describe('NetworkError', () => {
    it('creates with default message', () => {
      const error = new NetworkError();
      expect(error.message).toBe('Network connection failed');
      expect(error.category).toBe('network');
      expect(error.shouldReport).toBe(false);
    });

    it('creates with custom message', () => {
      const error = new NetworkError('Connection timeout');
      expect(error.message).toBe('Connection timeout');
    });
  });

  describe('ValidationError', () => {
    it('creates validation error', () => {
      const error = new ValidationError('Invalid input');
      expect(error.category).toBe('validation');
      expect(error.severity).toBe('warning');
      expect(error.shouldReport).toBe(false);
    });

    it('stores field errors', () => {
      const fields = { email: 'Invalid email', phone: 'Required' };
      const error = new ValidationError('Validation failed', fields);
      expect(error.fields).toEqual(fields);
    });
  });

  describe('AuthError', () => {
    it('creates with default message', () => {
      const error = new AuthError();
      expect(error.message).toBe('Authentication required');
      expect(error.category).toBe('auth');
      expect(error.statusCode).toBe(401);
    });
  });

  describe('PermissionError', () => {
    it('creates with default message', () => {
      const error = new PermissionError();
      expect(error.message).toBe('Permission denied');
      expect(error.category).toBe('permission');
      expect(error.statusCode).toBe(403);
    });
  });

  describe('NotFoundError', () => {
    it('creates with resource name only', () => {
      const error = new NotFoundError('Patient');
      expect(error.message).toBe('Patient not found');
      expect(error.category).toBe('notFound');
      expect(error.statusCode).toBe(404);
    });

    it('creates with resource name and ID', () => {
      const error = new NotFoundError('Patient', 123);
      expect(error.message).toBe('Patient with ID 123 not found');
      expect(error.context?.entityType).toBe('Patient');
      expect(error.context?.entityId).toBe(123);
    });
  });

  describe('TimeoutError', () => {
    it('creates with default message', () => {
      const error = new TimeoutError();
      expect(error.message).toBe('Request timed out');
      expect(error.category).toBe('timeout');
    });

    it('creates with operation name', () => {
      const error = new TimeoutError('fetchPatients');
      expect(error.message).toBe('Operation timed out: fetchPatients');
      expect(error.context?.action).toBe('fetchPatients');
    });
  });

  // ============================================================================
  // Error Extraction
  // ============================================================================

  describe('extractErrorMessage', () => {
    it('extracts from string', () => {
      expect(extractErrorMessage('Simple error')).toBe('Simple error');
    });

    it('extracts from Error object', () => {
      expect(extractErrorMessage(new Error('Error message'))).toBe('Error message');
    });

    it('extracts from AppBaseError', () => {
      expect(extractErrorMessage(new AppBaseError('App error'))).toBe('App error');
    });

    it('handles null', () => {
      expect(extractErrorMessage(null)).toBe('An unknown error occurred');
    });

    it('handles undefined', () => {
      expect(extractErrorMessage(undefined)).toBe('An unknown error occurred');
    });

    it('extracts from object with message property', () => {
      expect(extractErrorMessage({ message: 'Object error' })).toBe('Object error');
    });

    it('extracts from object with error property', () => {
      expect(extractErrorMessage({ error: 'Error string' })).toBe('Error string');
      expect(extractErrorMessage({ error: { message: 'Nested error' } })).toBe('Nested error');
    });

    it('stringifies unknown objects', () => {
      expect(extractErrorMessage({ code: 'ERR_123' })).toBe('{"code":"ERR_123"}');
    });

    it('handles empty object', () => {
      expect(extractErrorMessage({})).toBe('An unexpected error occurred');
    });
  });

  // ============================================================================
  // Error Normalization
  // ============================================================================

  describe('normalizeError', () => {
    it('normalizes AppBaseError', () => {
      const error = new ApiError('API failed', 500);
      const normalized = normalizeError(error);

      expect(normalized.message).toBe('API failed');
      expect(normalized.category).toBe('api');
      expect(normalized.statusCode).toBe(500);
    });

    it('normalizes standard Error', () => {
      const error = new Error('Standard error');
      const normalized = normalizeError(error);

      expect(normalized.message).toBe('Standard error');
      expect(normalized.category).toBe('unknown');
      expect(normalized.originalError).toBe(error);
      expect(normalized.stack).toBeDefined();
    });

    it('normalizes string error', () => {
      const normalized = normalizeError('String error');
      expect(normalized.message).toBe('String error');
    });

    it('extracts status code from object', () => {
      const normalized = normalizeError({ message: 'Error', status: 404 });
      expect(normalized.statusCode).toBe(404);
      expect(normalized.category).toBe('notFound');
    });

    it('extracts statusCode from object', () => {
      const normalized = normalizeError({ message: 'Error', statusCode: 401 });
      expect(normalized.statusCode).toBe(401);
      expect(normalized.category).toBe('auth');
    });

    it('adds context to normalized error', () => {
      const normalized = normalizeError('Error', {
        source: 'TestComponent',
        action: 'testAction',
      });

      expect(normalized.context?.source).toBe('TestComponent');
      expect(normalized.context?.action).toBe('testAction');
    });

    it('detects network errors from TypeError with fetch', () => {
      const error = new TypeError('Failed to fetch');
      const normalized = normalizeError(error);

      expect(normalized.category).toBe('network');
      expect(normalized.shouldReport).toBe(false);
    });

    it('sets critical severity for 500+ errors', () => {
      const normalized = normalizeError({ message: 'Error', status: 503 });
      expect(normalized.severity).toBe('critical');
    });
  });

  // ============================================================================
  // Error Translation Keys
  // ============================================================================

  describe('getErrorTranslationKey', () => {
    it('returns key for known error code', () => {
      const error: AppError = {
        message: 'Not found',
        category: 'notFound',
        severity: 'warning',
        code: 'PATIENT_NOT_FOUND',
        shouldReport: false,
        shouldDisplay: true,
      };

      expect(getErrorTranslationKey(error)).toBe('errors:patient.notFound');
    });

    it('detects error code from message pattern', () => {
      const error = normalizeError('Appointment not found');
      expect(getErrorTranslationKey(error)).toBe('errors:appointment.notFound');
    });

    it('detects appointment conflict pattern', () => {
      const error = normalizeError('There is a conflict with another appointment');
      expect(getErrorTranslationKey(error)).toBe('errors:appointment.conflict');
    });

    it('detects room not available pattern', () => {
      const error = normalizeError('Room is not available');
      expect(getErrorTranslationKey(error)).toBe('errors:appointment.roomNotAvailable');
    });

    it('detects database errors', () => {
      const error = normalizeError('UNIQUE constraint failed');
      expect(getErrorTranslationKey(error)).toBe('errors:database.uniqueConstraintViolation');
    });

    it('falls back to category key', () => {
      const error: AppError = {
        message: 'Unknown validation issue',
        category: 'validation',
        severity: 'warning',
        shouldReport: false,
        shouldDisplay: true,
      };

      expect(getErrorTranslationKey(error)).toBe('errors:category.validation');
    });

    it('normalizes non-AppError input', () => {
      expect(getErrorTranslationKey('Patient not found')).toBe('errors:patient.notFound');
    });
  });

  describe('getUserFriendlyMessage', () => {
    it('returns original message without translation function', () => {
      const error = normalizeError('Some error');
      expect(getUserFriendlyMessage(error)).toBe('Some error');
    });

    it('returns translated message with translation function', () => {
      const mockT = vi.fn((key: string) => {
        if (key === 'errors:patient.notFound') return 'Patient was not found';
        return key;
      });

      const error: AppError = {
        message: 'Patient not found',
        category: 'notFound',
        severity: 'warning',
        code: 'PATIENT_NOT_FOUND',
        shouldReport: false,
        shouldDisplay: true,
      };

      expect(getUserFriendlyMessage(error, mockT)).toBe('Patient was not found');
    });

    it('falls back to original message if translation not found', () => {
      const mockT = vi.fn((key: string) => key); // Returns key unchanged

      const error = normalizeError('Very specific error message');
      const result = getUserFriendlyMessage(error, mockT);

      expect(result).toBe('Very specific error message');
    });
  });

  // ============================================================================
  // Error Handlers
  // ============================================================================

  describe('handleError', () => {
    beforeEach(() => {
      // Reset to no-op reporter
      setErrorReporter({
        report: vi.fn(),
        setUser: vi.fn(),
        addBreadcrumb: vi.fn(),
      });
    });

    it('normalizes and adds timestamp to context', () => {
      const appError = handleError('Test error', { source: 'Test' });

      expect(appError.message).toBe('Test error');
      expect(appError.context?.source).toBe('Test');
      expect(appError.context?.timestamp).toBeDefined();
    });

    it('reports to error reporter when shouldReport is true', () => {
      const mockReporter = {
        report: vi.fn(),
        setUser: vi.fn(),
        addBreadcrumb: vi.fn(),
      };
      setErrorReporter(mockReporter);

      handleError(new ApiError('Server error', 500));

      expect(mockReporter.report).toHaveBeenCalled();
    });

    it('does not report when shouldReport is false', () => {
      const mockReporter = {
        report: vi.fn(),
        setUser: vi.fn(),
        addBreadcrumb: vi.fn(),
      };
      setErrorReporter(mockReporter);

      handleError(new ValidationError('Invalid input'));

      expect(mockReporter.report).not.toHaveBeenCalled();
    });
  });

  describe('createErrorHandler', () => {
    it('creates handler with preset context', () => {
      const handler = createErrorHandler('TestComponent', 'testAction');
      const appError = handler('Error occurred');

      expect(appError.context?.source).toBe('TestComponent');
      expect(appError.context?.action).toBe('testAction');
    });

    it('merges additional context', () => {
      const handler = createErrorHandler('TestComponent');
      const appError = handler('Error', { entityId: 123 });

      expect(appError.context?.source).toBe('TestComponent');
      expect(appError.context?.entityId).toBe(123);
    });
  });

  describe('createMutationErrorHandler', () => {
    it('creates handler that shows notification', () => {
      const mockNotification = { error: vi.fn() };
      const mockT = vi.fn((key: string) => key);

      const handler = createMutationErrorHandler(
        mockNotification,
        'Create Patient',
        mockT,
        'usePatients'
      );

      handler('Patient creation failed');

      expect(mockNotification.error).toHaveBeenCalledWith(
        expect.objectContaining({
          placement: 'bottomRight',
          duration: 5,
        })
      );
    });
  });

  // ============================================================================
  // Type Guards
  // ============================================================================

  describe('isErrorCategory', () => {
    it('checks AppBaseError category', () => {
      const networkError = new NetworkError();
      expect(isErrorCategory(networkError, 'network')).toBe(true);
      expect(isErrorCategory(networkError, 'auth')).toBe(false);
    });

    it('normalizes and checks unknown error', () => {
      expect(isErrorCategory({ message: 'Error', status: 401 }, 'auth')).toBe(true);
    });
  });

  describe('isNetworkError', () => {
    it('returns true for network errors', () => {
      expect(isNetworkError(new NetworkError())).toBe(true);
    });

    it('returns false for other errors', () => {
      expect(isNetworkError(new AuthError())).toBe(false);
    });
  });

  describe('isAuthError', () => {
    it('returns true for auth errors', () => {
      expect(isAuthError(new AuthError())).toBe(true);
    });

    it('returns true for 401 status', () => {
      expect(isAuthError({ message: 'Error', status: 401 })).toBe(true);
    });
  });

  describe('isNotFoundError', () => {
    it('returns true for not found errors', () => {
      expect(isNotFoundError(new NotFoundError('Patient'))).toBe(true);
    });

    it('returns true for 404 status', () => {
      expect(isNotFoundError({ message: 'Error', status: 404 })).toBe(true);
    });
  });

  describe('isValidationError', () => {
    it('returns true for validation errors', () => {
      expect(isValidationError(new ValidationError('Invalid'))).toBe(true);
    });

    it('returns true for 400 status', () => {
      expect(isValidationError({ message: 'Error', status: 400 })).toBe(true);
    });
  });

  // ============================================================================
  // Error Reporter
  // ============================================================================

  describe('ErrorReporter', () => {
    it('allows setting custom reporter', () => {
      const customReporter = {
        report: vi.fn(),
        setUser: vi.fn(),
        addBreadcrumb: vi.fn(),
      };

      setErrorReporter(customReporter);
      const reporter = getErrorReporter();

      expect(reporter).toBe(customReporter);
    });
  });

  // ============================================================================
  // Real-World Scenarios
  // ============================================================================

  describe('Real-World Scenarios', () => {
    it('handles Tauri invoke error format', () => {
      const tauriError = {
        message: 'Appointment not found',
      };

      const normalized = normalizeError(tauriError);
      expect(normalized.message).toBe('Appointment not found');
      expect(getErrorTranslationKey(normalized)).toBe('errors:appointment.notFound');
    });

    it('handles database constraint violation', () => {
      const dbError = 'UNIQUE constraint failed: patients.microchip_id';

      const normalized = normalizeError(dbError);
      expect(getErrorTranslationKey(normalized)).toBe('errors:database.uniqueConstraintViolation');
    });

    it('handles timeout during API call', () => {
      const timeoutError = new TimeoutError('fetchAppointments');

      expect(timeoutError.category).toBe('timeout');
      expect(timeoutError.shouldReport).toBe(true);
      // Pattern matcher detects 'timed out' and maps to TIMEOUT -> errors:network.timeout
      expect(getErrorTranslationKey(timeoutError.toAppError())).toBe('errors:network.timeout');
    });

    it('chains error handling in catch block', () => {
      const mockNotification = { error: vi.fn() };
      const mockT = vi.fn((key: string) => key);
      const handler = createMutationErrorHandler(
        mockNotification,
        'Save Patient',
        mockT,
        'PatientForm'
      );

      // Simulate typical catch block usage
      try {
        throw new ValidationError('Name is required', { name: 'Required field' });
      } catch (error) {
        handler(error);
      }

      expect(mockNotification.error).toHaveBeenCalled();
    });
  });
});
