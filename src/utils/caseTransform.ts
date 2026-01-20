/**
 * Utility functions for transforming between snake_case and camelCase
 * Used for DTO transformation between backend (Rust) and frontend (TypeScript)
 */

/**
 * Convert a snake_case string to camelCase
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert a camelCase string to snake_case
 */
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Transform all keys of an object from snake_case to camelCase
 */
export function snakeToCamelObject<T extends Record<string, any>>(obj: T): Record<string, any> {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => snakeToCamelObject(item)) as any;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  return Object.keys(obj).reduce((acc, key) => {
    const camelKey = snakeToCamel(key);
    const value = obj[key];

    // Recursively transform nested objects and arrays
    if (value !== null && typeof value === 'object') {
      acc[camelKey] = snakeToCamelObject(value);
    } else {
      acc[camelKey] = value;
    }

    return acc;
  }, {} as Record<string, any>);
}

/**
 * Transform all keys of an object from camelCase to snake_case
 */
export function camelToSnakeObject<T extends Record<string, any>>(obj: T): Record<string, any> {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => camelToSnakeObject(item)) as any;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  return Object.keys(obj).reduce((acc, key) => {
    const snakeKey = camelToSnake(key);
    const value = obj[key];

    // Recursively transform nested objects and arrays
    if (value !== null && typeof value === 'object') {
      acc[snakeKey] = camelToSnakeObject(value);
    } else {
      acc[snakeKey] = value;
    }

    return acc;
  }, {} as Record<string, any>);
}

/**
 * Type-safe version that preserves the structure but transforms keys
 * Usage: const result = transformKeys<MyType>(apiResponse, 'snakeToCamel');
 */
export function transformKeys<T>(
  obj: Record<string, any>,
  direction: 'snakeToCamel' | 'camelToSnake'
): T {
  const transformer = direction === 'snakeToCamel' ? snakeToCamelObject : camelToSnakeObject;
  return transformer(obj) as T;
}
