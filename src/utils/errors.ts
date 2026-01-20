/**
 * Centralized Error Handling Utility
 *
 * This module provides:
 * 1. Custom error classes for different error types
 * 2. Error extraction and normalization
 * 3. Error reporting infrastructure (extensible for Sentry, etc.)
 * 4. User-friendly error message generation
 *
 * @see https://blog.sentry.io/guide-to-error-and-exception-handling-in-react/
 * @see https://medium.com/carousell-insider/mastering-error-handling-in-frontend-applications-a-comprehensive-guide-2df73846385b
 */

import type { ReactNode } from 'react';

// ============================================================================
// Error Types & Classification
// ============================================================================

/**
 * Error severity levels for categorization and reporting
 */
export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Error categories for grouping and handling
 */
export type ErrorCategory =
  | 'network'      // Network/connectivity issues
  | 'api'          // API/backend errors
  | 'validation'   // Input validation errors
  | 'auth'         // Authentication/authorization errors
  | 'permission'   // Permission denied errors
  | 'notFound'     // Resource not found
  | 'conflict'     // Data conflict errors
  | 'timeout'      // Request timeout
  | 'unknown';     // Uncategorized errors

/**
 * Structured error context for debugging and reporting
 */
export interface ErrorContext {
  /** Where the error occurred (component, hook, service) */
  source?: string;
  /** The action being performed when error occurred */
  action?: string;
  /** Related entity ID (patient, appointment, etc.) */
  entityId?: number | string;
  /** Related entity type */
  entityType?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** User ID if available */
  userId?: string;
  /** Timestamp of the error */
  timestamp?: string;
}

/**
 * Normalized error structure used throughout the application
 */
export interface AppError {
  /** Error message for display */
  message: string;
  /** Original error message from source */
  originalMessage?: string;
  /** Error category */
  category: ErrorCategory;
  /** Severity level */
  severity: ErrorSeverity;
  /** HTTP status code if applicable */
  statusCode?: number;
  /** Error code for programmatic handling */
  code?: string;
  /** Context information */
  context?: ErrorContext;
  /** Original error object */
  originalError?: unknown;
  /** Stack trace if available */
  stack?: string;
  /** Whether this error should be reported to monitoring service */
  shouldReport: boolean;
  /** Whether this error should be shown to user */
  shouldDisplay: boolean;
}

// ============================================================================
// Custom Error Classes
// ============================================================================

/**
 * Base application error class
 * All custom errors should extend this
 */
export class AppBaseError extends Error {
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly statusCode?: number;
  public readonly code?: string;
  public readonly context?: ErrorContext;
  public readonly shouldReport: boolean;
  public readonly shouldDisplay: boolean;
  public readonly timestamp: string;

  constructor(
    message: string,
    options: {
      category?: ErrorCategory;
      severity?: ErrorSeverity;
      statusCode?: number;
      code?: string;
      context?: ErrorContext;
      shouldReport?: boolean;
      shouldDisplay?: boolean;
      cause?: Error;
    } = {}
  ) {
    super(message, { cause: options.cause });

    // Fix prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);

    this.name = this.constructor.name;
    this.category = options.category || 'unknown';
    this.severity = options.severity || 'error';
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.context = options.context;
    this.shouldReport = options.shouldReport ?? true;
    this.shouldDisplay = options.shouldDisplay ?? true;
    this.timestamp = new Date().toISOString();

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toAppError(): AppError {
    return {
      message: this.message,
      originalMessage: this.message,
      category: this.category,
      severity: this.severity,
      statusCode: this.statusCode,
      code: this.code,
      context: this.context,
      originalError: this,
      stack: this.stack,
      shouldReport: this.shouldReport,
      shouldDisplay: this.shouldDisplay,
    };
  }
}

/**
 * API/Backend errors
 */
export class ApiError extends AppBaseError {
  constructor(
    message: string,
    statusCode?: number,
    options: {
      code?: string;
      context?: ErrorContext;
    } = {}
  ) {
    const category = categorizeByStatusCode(statusCode);
    const severity = statusCode && statusCode >= 500 ? 'critical' : 'error';

    super(message, {
      category,
      severity,
      statusCode,
      code: options.code,
      context: options.context,
      shouldReport: statusCode ? statusCode >= 500 : true,
    });
  }
}

/**
 * Network connectivity errors
 */
export class NetworkError extends AppBaseError {
  constructor(message = 'Network connection failed', context?: ErrorContext) {
    super(message, {
      category: 'network',
      severity: 'error',
      context,
      shouldReport: false, // Usually client-side issue
    });
  }
}

/**
 * Validation errors (form inputs, data validation)
 */
export class ValidationError extends AppBaseError {
  public readonly fields?: Record<string, string>;

  constructor(
    message: string,
    fields?: Record<string, string>,
    context?: ErrorContext
  ) {
    super(message, {
      category: 'validation',
      severity: 'warning',
      context,
      shouldReport: false,
    });
    this.fields = fields;
  }
}

/**
 * Authentication errors
 */
export class AuthError extends AppBaseError {
  constructor(message = 'Authentication required', context?: ErrorContext) {
    super(message, {
      category: 'auth',
      severity: 'warning',
      statusCode: 401,
      context,
      shouldReport: false,
    });
  }
}

/**
 * Permission/Authorization errors
 */
export class PermissionError extends AppBaseError {
  constructor(message = 'Permission denied', context?: ErrorContext) {
    super(message, {
      category: 'permission',
      severity: 'warning',
      statusCode: 403,
      context,
      shouldReport: false,
    });
  }
}

/**
 * Resource not found errors
 */
export class NotFoundError extends AppBaseError {
  constructor(
    resource: string,
    id?: string | number,
    context?: ErrorContext
  ) {
    const message = id
      ? `${resource} with ID ${id} not found`
      : `${resource} not found`;

    super(message, {
      category: 'notFound',
      severity: 'warning',
      statusCode: 404,
      context: { ...context, entityType: resource, entityId: id },
      shouldReport: false,
    });
  }
}

/**
 * Timeout errors
 */
export class TimeoutError extends AppBaseError {
  constructor(operation?: string, context?: ErrorContext) {
    const message = operation
      ? `Operation timed out: ${operation}`
      : 'Request timed out';

    super(message, {
      category: 'timeout',
      severity: 'error',
      context: { ...context, action: operation },
      shouldReport: true,
    });
  }
}

// ============================================================================
// Error Extraction & Normalization
// ============================================================================

/**
 * Categorize error based on HTTP status code
 */
function categorizeByStatusCode(statusCode?: number): ErrorCategory {
  if (!statusCode) return 'unknown';

  if (statusCode === 401) return 'auth';
  if (statusCode === 403) return 'permission';
  if (statusCode === 404) return 'notFound';
  if (statusCode === 409) return 'conflict';
  if (statusCode === 408 || statusCode === 504) return 'timeout';
  if (statusCode >= 400 && statusCode < 500) return 'validation';
  if (statusCode >= 500) return 'api';

  return 'unknown';
}

/**
 * Extract error message from any error type
 * This is the main utility for getting a displayable error message
 */
export function extractErrorMessage(error: unknown): string {
  // Already a string
  if (typeof error === 'string') {
    return error;
  }

  // Null or undefined
  if (error == null) {
    return 'An unknown error occurred';
  }

  // Our custom error classes
  if (error instanceof AppBaseError) {
    return error.message;
  }

  // Standard Error object
  if (error instanceof Error) {
    return error.message || error.name || 'An error occurred';
  }

  // Tauri error format (has message property)
  if (typeof error === 'object' && 'message' in error) {
    const msg = (error as { message: unknown }).message;
    if (typeof msg === 'string') {
      return msg;
    }
  }

  // API response error format
  if (typeof error === 'object' && 'error' in error) {
    const err = (error as { error: unknown }).error;
    if (typeof err === 'string') {
      return err;
    }
    if (typeof err === 'object' && err && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
  }

  // Try to stringify
  try {
    const str = JSON.stringify(error);
    if (str !== '{}') {
      return str;
    }
  } catch {
    // Ignore stringify errors
  }

  return 'An unexpected error occurred';
}

/**
 * Normalize any error into our AppError structure
 */
export function normalizeError(
  error: unknown,
  context?: ErrorContext
): AppError {
  // Already our custom error
  if (error instanceof AppBaseError) {
    const appError = error.toAppError();
    if (context) {
      appError.context = { ...appError.context, ...context };
    }
    return appError;
  }

  const message = extractErrorMessage(error);

  // Try to extract status code
  let statusCode: number | undefined;
  if (typeof error === 'object' && error !== null) {
    if ('status' in error) statusCode = (error as { status: number }).status;
    else if ('statusCode' in error) statusCode = (error as { statusCode: number }).statusCode;
  }

  // Detect network errors
  if (error instanceof TypeError && message.includes('fetch')) {
    return {
      message: 'Unable to connect to the server. Please check your connection.',
      originalMessage: message,
      category: 'network',
      severity: 'error',
      context,
      originalError: error,
      stack: error instanceof Error ? error.stack : undefined,
      shouldReport: false,
      shouldDisplay: true,
    };
  }

  return {
    message,
    originalMessage: message,
    category: categorizeByStatusCode(statusCode),
    severity: statusCode && statusCode >= 500 ? 'critical' : 'error',
    statusCode,
    context,
    originalError: error,
    stack: error instanceof Error ? error.stack : undefined,
    shouldReport: statusCode ? statusCode >= 500 : true,
    shouldDisplay: true,
  };
}

// ============================================================================
// User-Friendly Error Messages (i18n)
// ============================================================================

/**
 * Map of error codes to i18n translation keys
 * These keys correspond to entries in errors.json
 */
const ERROR_CODE_TO_TRANSLATION_KEY: Record<string, string> = {
  // Network & Connection Errors
  'NETWORK_ERROR': 'errors:network.error',
  'TIMEOUT': 'errors:network.timeout',
  'CONNECTION_REFUSED': 'errors:network.connectionRefused',
  'CONNECTION_LOST': 'errors:network.connectionLost',
  'OFFLINE': 'errors:network.offline',

  // Authentication & Authorization Errors
  'UNAUTHORIZED': 'errors:auth.unauthorized',
  'SESSION_EXPIRED': 'errors:auth.sessionExpired',
  'FORBIDDEN': 'errors:auth.forbidden',
  'INVALID_CREDENTIALS': 'errors:auth.invalidCredentials',
  'ACCOUNT_LOCKED': 'errors:auth.accountLocked',
  'TOKEN_EXPIRED': 'errors:auth.tokenExpired',

  // Generic Resource Errors
  'NOT_FOUND': 'errors:generic.notFound',
  'ALREADY_EXISTS': 'errors:generic.alreadyExists',
  'DUPLICATE_ENTRY': 'errors:generic.duplicateEntry',
  'CONFLICT': 'errors:generic.conflict',
  'VALIDATION_ERROR': 'errors:generic.validation',
  'REQUIRED_FIELD_MISSING': 'errors:generic.requiredFieldMissing',
  'INVALID_FORMAT': 'errors:generic.invalidFormat',

  // Patient Errors
  'PATIENT_NOT_FOUND': 'errors:patient.notFound',
  'PATIENT_ALREADY_EXISTS': 'errors:patient.alreadyExists',
  'PATIENT_HAS_APPOINTMENTS': 'errors:patient.hasAppointments',
  'PATIENT_HAS_MEDICAL_RECORDS': 'errors:patient.hasMedicalRecords',
  'INVALID_PATIENT_DATA': 'errors:patient.invalidData',
  'PATIENT_INACTIVE': 'errors:patient.inactive',
  'MICROCHIP_ALREADY_REGISTERED': 'errors:patient.microchipAlreadyRegistered',
  'INVALID_DATE_OF_BIRTH': 'errors:patient.invalidDateOfBirth',
  'INVALID_WEIGHT': 'errors:patient.invalidWeight',

  // Household & Owner Errors
  'HOUSEHOLD_NOT_FOUND': 'errors:household.notFound',
  'OWNER_NOT_FOUND': 'errors:owner.notFound',
  'HOUSEHOLD_HAS_PATIENTS': 'errors:household.hasPatients',
  'OWNER_HAS_PATIENTS': 'errors:owner.hasPatients',
  'INVALID_CONTACT_INFO': 'errors:owner.invalidContactInfo',
  'DUPLICATE_HOUSEHOLD': 'errors:household.duplicate',
  'PRIMARY_CONTACT_REQUIRED': 'errors:household.primaryContactRequired',
  'INVALID_EMAIL': 'errors:owner.invalidEmail',
  'INVALID_PHONE': 'errors:owner.invalidPhone',
  'INVALID_ADDRESS': 'errors:owner.invalidAddress',

  // Appointment Errors
  'APPOINTMENT_NOT_FOUND': 'errors:appointment.notFound',
  'APPOINTMENT_CONFLICT': 'errors:appointment.conflict',
  'ROOM_NOT_AVAILABLE': 'errors:appointment.roomNotAvailable',
  'APPOINTMENT_IN_PAST': 'errors:appointment.inPast',
  'APPOINTMENT_CANCELLED': 'errors:appointment.cancelled',
  'APPOINTMENT_COMPLETED': 'errors:appointment.completed',
  'INVALID_TIME_RANGE': 'errors:appointment.invalidTimeRange',
  'APPOINTMENT_TOO_SHORT': 'errors:appointment.tooShort',
  'APPOINTMENT_TOO_LONG': 'errors:appointment.tooLong',
  'PATIENT_REQUIRED': 'errors:appointment.patientRequired',
  'INVALID_APPOINTMENT_STATUS': 'errors:appointment.invalidStatus',
  'CANNOT_MODIFY_PAST_APPOINTMENT': 'errors:appointment.cannotModifyPast',

  // Room Errors
  'ROOM_NOT_FOUND': 'errors:room.notFound',
  'ROOM_ALREADY_EXISTS': 'errors:room.alreadyExists',
  'ROOM_HAS_APPOINTMENTS': 'errors:room.hasAppointments',
  'ROOM_INACTIVE': 'errors:room.inactive',
  'INVALID_ROOM_CAPACITY': 'errors:room.invalidCapacity',
  'ROOM_AT_CAPACITY': 'errors:room.atCapacity',

  // Medical Record Errors
  'MEDICAL_RECORD_NOT_FOUND': 'errors:medicalRecord.notFound',
  'MEDICAL_RECORD_ARCHIVED': 'errors:medicalRecord.archived',
  'CANNOT_EDIT_ARCHIVED_RECORD': 'errors:medicalRecord.cannotEditArchived',
  'ATTACHMENT_NOT_FOUND': 'errors:medicalRecord.attachmentNotFound',
  'ATTACHMENT_TOO_LARGE': 'errors:medicalRecord.attachmentTooLarge',
  'INVALID_FILE_TYPE': 'errors:medicalRecord.invalidFileType',
  'UPLOAD_FAILED': 'errors:medicalRecord.uploadFailed',
  'DOWNLOAD_FAILED': 'errors:medicalRecord.downloadFailed',
  'PDF_GENERATION_FAILED': 'errors:medicalRecord.pdfGenerationFailed',
  'TEMPLATE_NOT_FOUND': 'errors:medicalRecord.templateNotFound',
  'INVALID_RECORD_TYPE': 'errors:medicalRecord.invalidRecordType',

  // Species & Breed Errors
  'SPECIES_NOT_FOUND': 'errors:species.notFound',
  'BREED_NOT_FOUND': 'errors:breed.notFound',
  'SPECIES_HAS_PATIENTS': 'errors:species.hasPatients',
  'BREED_HAS_PATIENTS': 'errors:breed.hasPatients',
  'SPECIES_ALREADY_EXISTS': 'errors:species.alreadyExists',
  'BREED_ALREADY_EXISTS': 'errors:breed.alreadyExists',
  'INVALID_SPECIES': 'errors:species.invalid',
  'INVALID_BREED': 'errors:breed.invalid',

  // Device Integration Errors
  'DEVICE_NOT_FOUND': 'errors:device.notFound',
  'DEVICE_CONNECTION_FAILED': 'errors:device.connectionFailed',
  'DEVICE_OFFLINE': 'errors:device.offline',
  'DEVICE_BUSY': 'errors:device.busy',
  'INVALID_DEVICE_CONFIG': 'errors:device.invalidConfig',
  'SERIAL_PORT_ERROR': 'errors:device.serialPortError',
  'SERIAL_PORT_IN_USE': 'errors:device.serialPortInUse',
  'FILE_WATCH_ERROR': 'errors:device.fileWatchError',
  'PARSE_ERROR': 'errors:device.parseError',
  'DEVICE_DATA_INVALID': 'errors:device.dataInvalid',
  'DEVICE_TIMEOUT': 'errors:device.timeout',

  // Google Calendar Errors
  'GOOGLE_AUTH_FAILED': 'errors:googleCalendar.authFailed',
  'GOOGLE_TOKEN_EXPIRED': 'errors:googleCalendar.tokenExpired',
  'GOOGLE_SYNC_FAILED': 'errors:googleCalendar.syncFailed',
  'GOOGLE_CALENDAR_NOT_FOUND': 'errors:googleCalendar.notFound',
  'GOOGLE_PERMISSION_DENIED': 'errors:googleCalendar.permissionDenied',
  'GOOGLE_QUOTA_EXCEEDED': 'errors:googleCalendar.quotaExceeded',
  'GOOGLE_DISCONNECTED': 'errors:googleCalendar.disconnected',
  'SYNC_IN_PROGRESS': 'errors:googleCalendar.syncInProgress',

  // Settings Errors
  'SETTINGS_NOT_FOUND': 'errors:settings.notFound',
  'INVALID_SETTINGS': 'errors:settings.invalid',
  'SETTINGS_SAVE_FAILED': 'errors:settings.saveFailed',
  'INVALID_DATE_FORMAT': 'errors:settings.invalidDateFormat',
  'INVALID_CURRENCY': 'errors:settings.invalidCurrency',
  'INVALID_LANGUAGE': 'errors:settings.invalidLanguage',
  'INVALID_THEME': 'errors:settings.invalidTheme',

  // File & Storage Errors
  'FILE_NOT_FOUND': 'errors:file.notFound',
  'FILE_READ_ERROR': 'errors:file.readError',
  'FILE_WRITE_ERROR': 'errors:file.writeError',
  'STORAGE_FULL': 'errors:file.storageFull',
  'PERMISSION_DENIED': 'errors:file.permissionDenied',
  'FILE_CORRUPTED': 'errors:file.corrupted',
  'UNSUPPORTED_FORMAT': 'errors:file.unsupportedFormat',

  // Database Errors
  'DATABASE_ERROR': 'errors:database.error',
  'DATABASE_CONNECTION_FAILED': 'errors:database.connectionFailed',
  'DATABASE_LOCKED': 'errors:database.locked',
  'MIGRATION_FAILED': 'errors:database.migrationFailed',
  'DATA_INTEGRITY_ERROR': 'errors:database.integrityError',
  'FOREIGN_KEY_VIOLATION': 'errors:database.foreignKeyViolation',
  'UNIQUE_CONSTRAINT_VIOLATION': 'errors:database.uniqueConstraintViolation',

  // Server Errors
  'SERVER_ERROR': 'errors:server.error',
  'INTERNAL_ERROR': 'errors:server.internal',
  'SERVICE_UNAVAILABLE': 'errors:server.unavailable',
  'MAINTENANCE_MODE': 'errors:server.maintenance',
  'RATE_LIMITED': 'errors:server.rateLimited',

  // Update Errors
  'UPDATE_CHECK_FAILED': 'errors:update.checkFailed',
  'UPDATE_DOWNLOAD_FAILED': 'errors:update.downloadFailed',
  'UPDATE_INSTALL_FAILED': 'errors:update.installFailed',
  'NO_UPDATES_AVAILABLE': 'errors:update.noUpdatesAvailable',
};

/**
 * Category to translation key mapping for fallbacks
 */
const CATEGORY_TO_TRANSLATION_KEY: Record<ErrorCategory, string> = {
  network: 'errors:category.network',
  auth: 'errors:category.auth',
  permission: 'errors:category.permission',
  notFound: 'errors:category.notFound',
  validation: 'errors:category.validation',
  timeout: 'errors:category.timeout',
  api: 'errors:category.server',
  conflict: 'errors:generic.conflict',
  unknown: 'errors:generic.unexpected',
};

/**
 * Pattern matchers to detect error codes from error messages
 * Maps regex patterns to error codes
 */
const ERROR_PATTERN_MATCHERS: Array<{ pattern: RegExp; code: string }> = [
  // Patient patterns
  { pattern: /patient.*not found/i, code: 'PATIENT_NOT_FOUND' },
  { pattern: /patient.*already exists/i, code: 'PATIENT_ALREADY_EXISTS' },
  { pattern: /microchip.*already/i, code: 'MICROCHIP_ALREADY_REGISTERED' },
  { pattern: /cannot delete.*patient.*appointment/i, code: 'PATIENT_HAS_APPOINTMENTS' },
  { pattern: /cannot delete.*patient.*medical/i, code: 'PATIENT_HAS_MEDICAL_RECORDS' },

  // Household/Owner patterns
  { pattern: /household.*not found/i, code: 'HOUSEHOLD_NOT_FOUND' },
  { pattern: /owner.*not found/i, code: 'OWNER_NOT_FOUND' },
  { pattern: /cannot delete.*household.*patient/i, code: 'HOUSEHOLD_HAS_PATIENTS' },
  { pattern: /cannot delete.*owner.*patient/i, code: 'OWNER_HAS_PATIENTS' },
  { pattern: /invalid.*email/i, code: 'INVALID_EMAIL' },
  { pattern: /invalid.*phone/i, code: 'INVALID_PHONE' },

  // Appointment patterns
  { pattern: /appointment.*not found/i, code: 'APPOINTMENT_NOT_FOUND' },
  { pattern: /conflict.*appointment/i, code: 'APPOINTMENT_CONFLICT' },
  { pattern: /appointment.*conflict/i, code: 'APPOINTMENT_CONFLICT' },
  { pattern: /room.*not available/i, code: 'ROOM_NOT_AVAILABLE' },
  { pattern: /time.*conflict/i, code: 'APPOINTMENT_CONFLICT' },
  { pattern: /overlapping.*appointment/i, code: 'APPOINTMENT_CONFLICT' },
  { pattern: /appointment.*cancelled/i, code: 'APPOINTMENT_CANCELLED' },

  // Room patterns
  { pattern: /room.*not found/i, code: 'ROOM_NOT_FOUND' },
  { pattern: /room.*already exists/i, code: 'ROOM_ALREADY_EXISTS' },
  { pattern: /cannot delete.*room.*appointment/i, code: 'ROOM_HAS_APPOINTMENTS' },

  // Medical record patterns
  { pattern: /medical record.*not found/i, code: 'MEDICAL_RECORD_NOT_FOUND' },
  { pattern: /record.*not found/i, code: 'MEDICAL_RECORD_NOT_FOUND' },
  { pattern: /attachment.*not found/i, code: 'ATTACHMENT_NOT_FOUND' },
  { pattern: /file.*too large/i, code: 'ATTACHMENT_TOO_LARGE' },
  { pattern: /invalid.*file type/i, code: 'INVALID_FILE_TYPE' },
  { pattern: /unsupported.*file/i, code: 'INVALID_FILE_TYPE' },
  { pattern: /pdf.*generation.*fail/i, code: 'PDF_GENERATION_FAILED' },
  { pattern: /template.*not found/i, code: 'TEMPLATE_NOT_FOUND' },

  // Species/Breed patterns
  { pattern: /species.*not found/i, code: 'SPECIES_NOT_FOUND' },
  { pattern: /breed.*not found/i, code: 'BREED_NOT_FOUND' },
  { pattern: /cannot delete.*species.*patient/i, code: 'SPECIES_HAS_PATIENTS' },
  { pattern: /cannot delete.*breed.*patient/i, code: 'BREED_HAS_PATIENTS' },

  // Device patterns
  { pattern: /device.*not found/i, code: 'DEVICE_NOT_FOUND' },
  { pattern: /device.*connection.*fail/i, code: 'DEVICE_CONNECTION_FAILED' },
  { pattern: /serial port.*error/i, code: 'SERIAL_PORT_ERROR' },
  { pattern: /serial port.*in use/i, code: 'SERIAL_PORT_IN_USE' },
  { pattern: /failed to parse/i, code: 'PARSE_ERROR' },
  { pattern: /parse.*error/i, code: 'PARSE_ERROR' },

  // Google Calendar patterns
  { pattern: /google.*auth.*fail/i, code: 'GOOGLE_AUTH_FAILED' },
  { pattern: /google.*token.*expired/i, code: 'GOOGLE_TOKEN_EXPIRED' },
  { pattern: /google.*sync.*fail/i, code: 'GOOGLE_SYNC_FAILED' },
  { pattern: /google.*permission/i, code: 'GOOGLE_PERMISSION_DENIED' },
  { pattern: /quota.*exceeded/i, code: 'GOOGLE_QUOTA_EXCEEDED' },

  // Database patterns
  { pattern: /database.*error/i, code: 'DATABASE_ERROR' },
  { pattern: /database.*locked/i, code: 'DATABASE_LOCKED' },
  { pattern: /foreign key.*constraint/i, code: 'FOREIGN_KEY_VIOLATION' },
  { pattern: /unique.*constraint/i, code: 'UNIQUE_CONSTRAINT_VIOLATION' },
  { pattern: /duplicate.*key/i, code: 'UNIQUE_CONSTRAINT_VIOLATION' },
  { pattern: /UNIQUE constraint failed/i, code: 'UNIQUE_CONSTRAINT_VIOLATION' },

  // File patterns
  { pattern: /file.*not found/i, code: 'FILE_NOT_FOUND' },
  { pattern: /permission denied/i, code: 'PERMISSION_DENIED' },
  { pattern: /storage.*full/i, code: 'STORAGE_FULL' },

  // Network patterns
  { pattern: /network.*error/i, code: 'NETWORK_ERROR' },
  { pattern: /connection.*refused/i, code: 'CONNECTION_REFUSED' },
  { pattern: /connection.*lost/i, code: 'CONNECTION_LOST' },
  { pattern: /timed? ?out/i, code: 'TIMEOUT' },
  { pattern: /offline/i, code: 'OFFLINE' },

  // Server patterns
  { pattern: /internal.*error/i, code: 'INTERNAL_ERROR' },
  { pattern: /service.*unavailable/i, code: 'SERVICE_UNAVAILABLE' },
  { pattern: /rate.*limit/i, code: 'RATE_LIMITED' },
];

/**
 * Detect error code from message using pattern matching
 */
function detectErrorCode(message: string): string | null {
  for (const { pattern, code } of ERROR_PATTERN_MATCHERS) {
    if (pattern.test(message)) {
      return code;
    }
  }
  return null;
}

/**
 * Translation function type (from react-i18next)
 */
export type TFunction = (key: string, options?: Record<string, unknown>) => string;

/**
 * Get the translation key for an error
 * Returns the i18n key that should be used to translate this error
 */
export function getErrorTranslationKey(error: AppError | unknown): string {
  const normalized = error instanceof Object && 'category' in error
    ? error as AppError
    : normalizeError(error);

  // Strategy 1: Check for known explicit error code
  if (normalized.code && ERROR_CODE_TO_TRANSLATION_KEY[normalized.code]) {
    return ERROR_CODE_TO_TRANSLATION_KEY[normalized.code];
  }

  // Strategy 2: Try to detect error code from message pattern
  const detectedCode = detectErrorCode(normalized.message);
  if (detectedCode && ERROR_CODE_TO_TRANSLATION_KEY[detectedCode]) {
    return ERROR_CODE_TO_TRANSLATION_KEY[detectedCode];
  }

  // Strategy 3: Category-based fallbacks
  return CATEGORY_TO_TRANSLATION_KEY[normalized.category] || 'errors:generic.unexpected';
}

/**
 * Get a user-friendly error message (translated)
 * Uses multiple strategies:
 * 1. Explicit error code lookup
 * 2. Pattern matching on error message
 * 3. Category-based fallbacks
 * 4. Original message as last resort
 *
 * @param error - The error to get a message for
 * @param t - The translation function from useTranslation()
 */
export function getUserFriendlyMessage(error: AppError | unknown, t?: TFunction): string {
  const normalized = error instanceof Object && 'category' in error
    ? error as AppError
    : normalizeError(error);

  // If no translation function provided, return the original message
  if (!t) {
    return normalized.message || 'An unexpected error occurred';
  }

  // Get the translation key
  const translationKey = getErrorTranslationKey(normalized);

  // Translate and return
  const translated = t(translationKey);

  // If translation returns the key itself (not found), fall back to original message
  if (translated === translationKey) {
    return normalized.message || t('errors:generic.unexpected');
  }

  return translated;
}

// ============================================================================
// Error Reporting Service
// ============================================================================

/**
 * Error reporter interface for extensibility
 * Implement this to add Sentry, LogRocket, or custom reporting
 */
export interface ErrorReporter {
  report(error: AppError): void;
  setUser(userId: string, userData?: Record<string, unknown>): void;
  addBreadcrumb(message: string, data?: Record<string, unknown>): void;
}

/**
 * Console-based error reporter (default, for development)
 */
class ConsoleErrorReporter implements ErrorReporter {
  report(error: AppError): void {
    const logMethod = error.severity === 'critical' ? console.error :
                      error.severity === 'warning' ? console.warn :
                      console.log;

    logMethod(
      `[${error.severity.toUpperCase()}] [${error.category}] ${error.message}`,
      {
        code: error.code,
        statusCode: error.statusCode,
        context: error.context,
        stack: error.stack,
      }
    );
  }

  setUser(userId: string, userData?: Record<string, unknown>): void {
    console.debug('[ErrorReporter] User set:', userId, userData);
  }

  addBreadcrumb(message: string, data?: Record<string, unknown>): void {
    console.debug('[ErrorReporter] Breadcrumb:', message, data);
  }
}

/**
 * No-op reporter for production when no external service is configured
 */
class NoOpErrorReporter implements ErrorReporter {
  report(): void {}
  setUser(): void {}
  addBreadcrumb(): void {}
}

// Global error reporter instance
let errorReporter: ErrorReporter =
  import.meta.env.DEV ? new ConsoleErrorReporter() : new NoOpErrorReporter();

/**
 * Set the global error reporter
 * Use this to integrate Sentry or other services:
 *
 * @example
 * // In your app initialization:
 * import * as Sentry from '@sentry/react';
 *
 * setErrorReporter({
 *   report: (error) => Sentry.captureException(error.originalError, {
 *     tags: { category: error.category },
 *     extra: error.context,
 *   }),
 *   setUser: (id, data) => Sentry.setUser({ id, ...data }),
 *   addBreadcrumb: (msg, data) => Sentry.addBreadcrumb({ message: msg, data }),
 * });
 */
export function setErrorReporter(reporter: ErrorReporter): void {
  errorReporter = reporter;
}

/**
 * Get the current error reporter
 */
export function getErrorReporter(): ErrorReporter {
  return errorReporter;
}

// ============================================================================
// Main Error Handler
// ============================================================================

/**
 * Central error handler - processes and optionally reports errors
 *
 * @example
 * try {
 *   await someOperation();
 * } catch (error) {
 *   const handled = handleError(error, { source: 'SomeComponent', action: 'someOperation' });
 *   showNotification(handled.message);
 * }
 */
export function handleError(
  error: unknown,
  context?: ErrorContext
): AppError {
  const appError = normalizeError(error, {
    ...context,
    timestamp: new Date().toISOString(),
  });

  // Report to monitoring service if applicable
  if (appError.shouldReport) {
    errorReporter.report(appError);
  }

  return appError;
}

/**
 * Create an error handler with preset context
 * Useful for hooks and components
 *
 * @example
 * const handleError = createErrorHandler('usePatients', 'createPatient');
 *
 * onError: (error) => {
 *   const appError = handleError(error);
 *   notification.error({ message: 'Error', description: appError.message });
 * }
 */
export function createErrorHandler(source: string, action?: string) {
  return (error: unknown, additionalContext?: Partial<ErrorContext>): AppError => {
    return handleError(error, {
      source,
      action,
      ...additionalContext,
    });
  };
}

// ============================================================================
// React Query Integration Helpers
// ============================================================================

/**
 * Notification type that accepts Ant Design's NotificationInstance
 * Uses ReactNode to match ArgsProps from antd/notification
 */
type NotificationLike = {
  error: (config: {
    message: ReactNode;
    description?: ReactNode;
    placement?: 'top' | 'topLeft' | 'topRight' | 'bottom' | 'bottomLeft' | 'bottomRight';
    duration?: number | null;
  }) => void;
};

/**
 * Standard onError handler for React Query mutations
 * Returns a function that handles errors with notifications
 *
 * @example
 * const { t } = useTranslation('errors');
 *
 * useMutation({
 *   mutationFn: createPatient,
 *   onError: createMutationErrorHandler(notification, 'Create Patient', t, 'usePatients'),
 * })
 */
export function createMutationErrorHandler(
  notification: NotificationLike,
  operationName: string,
  t: TFunction,
  source?: string
) {
  return (error: unknown) => {
    const appError = handleError(error, { source, action: operationName });

    notification.error({
      message: t('errors:failedTo', { operation: operationName }),
      description: getUserFriendlyMessage(appError, t),
      placement: 'bottomRight',
      duration: 5,
    });
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if an error is of a specific category
 */
export function isErrorCategory(error: unknown, category: ErrorCategory): boolean {
  if (error instanceof AppBaseError) {
    return error.category === category;
  }
  const normalized = normalizeError(error);
  return normalized.category === category;
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  return isErrorCategory(error, 'network');
}

/**
 * Check if error is an authentication error
 */
export function isAuthError(error: unknown): boolean {
  return isErrorCategory(error, 'auth');
}

/**
 * Check if error is a not found error
 */
export function isNotFoundError(error: unknown): boolean {
  return isErrorCategory(error, 'notFound');
}

/**
 * Check if error is a validation error
 */
export function isValidationError(error: unknown): boolean {
  return isErrorCategory(error, 'validation');
}
