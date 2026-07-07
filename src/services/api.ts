/**
 * Base API service using Tauri's invoke functionality
 * Handles automatic case transformation between frontend (camelCase) and backend (snake_case)
 */

// Import the telemetry-wrapped invoke so command failures are auto-reported
// via the Rust-side log_event command (which feeds vet-clinic.log → Loki).
// Reporting lives in one place (services/invoke.ts) to avoid double-capture.
import { invoke } from './invoke';
import { ApiError, TauriError } from '../types/api';
import { camelToSnakeObject, snakeToCamelObject } from '../utils/caseTransform';

export class ApiService {
  /**
   * Wrapper around Tauri's invoke with error handling and automatic case transformation
   * - Converts args from camelCase to snake_case before sending
   * - Converts response from snake_case to camelCase after receiving
   *
   * ⚠️ WARNING: the outgoing camelCase → snake_case transformation breaks
   * multi-word top-level args. Tauri 1.x's `#[tauri::command]` macro renames
   * Rust snake_case args to camelCase on the wire by default — so a Rust
   * arg `patient_id: i64` is looked up in the payload as `patientId`. This
   * method converts `patientId` to `patient_id`, and Tauri's lookup fails
   * with "missing required key patientId".
   *
   * Safe uses (work because ApiService.invoke):
   *   - Single-word args: `{ id }`, `{ query }`, `{ enabled }` — no
   *     transformation applies, both sides see the same key.
   *   - DTO-wrapped args with snake_case DTOs (no serde rename):
   *     `{ input: { patientId, startTime } }` → inner gets snake-cased,
   *     which matches the DTO. Outer key (`input`) is single-word.
   *
   * Unsafe uses (use invokeRaw instead):
   *   - Bare multi-word args: `{ patientId, householdId }`
   *   - DTO-wrapped args with camelCase DTOs (serde rename_all =
   *     "camelCase"): the inner camelCase fields would get snake-cased
   *     and break the DTO deserialization.
   *
   * When in doubt, use `invokeRaw`. The proper long-term fix is to drop
   * the outgoing transformation entirely and add `rename_all = "camelCase"`
   * to the remaining snake_case Rust DTOs.
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
   * Invoke without args transformation, but still normalize the response
   * snake_case → camelCase.
   *
   * This is the right choice for commands with bare multi-word args
   * (`patientId`, `householdId`, …) or with DTO inputs that already use
   * camelCase (most modern DTOs in this app). The response is still
   * transformed because some response structs on the Rust side
   * (Household, Species, RoomAvailability, …) don't carry
   * #[serde(rename_all = "camelCase")] and would otherwise leak
   * snake_case keys into the frontend. snakeToCamel on an already-
   * camelCase object is a no-op, so this is safe for response structs
   * that DO have the rename too.
   */
  static async invokeRaw<T>(command: string, args?: any): Promise<T> {
    try {
      const result = await invoke<any>(command, args);
      return snakeToCamelObject(result) as T;
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