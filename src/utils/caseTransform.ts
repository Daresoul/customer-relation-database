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
 * An array with no objects in it (a file's bytes, a list of ids) has no
 * keys to rename; it is passed through as is instead of copied item by item.
 */
function isPlainValueArray(arr: unknown[]): boolean {
  return arr.length > 0 && typeof arr[0] !== 'object' && arr.every(v => v === null || typeof v !== 'object');
}

/** Rename every key, recursively, through nested objects and arrays. */
function renameKeys(value: unknown, rename: (key: string) => string): unknown {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return isPlainValueArray(value) ? value : value.map((item) => renameKeys(item, rename));
  }

  const source = value as Record<string, unknown>;
  return Object.keys(source).reduce<Record<string, unknown>>((acc, key) => {
    acc[rename(key)] = renameKeys(source[key], rename);
    return acc;
  }, {});
}

/**
 * Transform all keys of an object from snake_case to camelCase
 */
export function snakeToCamelObject(obj: unknown): unknown {
  return renameKeys(obj, snakeToCamel);
}

/**
 * Transform all keys of an object from camelCase to snake_case
 */
export function camelToSnakeObject(obj: unknown): unknown {
  return renameKeys(obj, camelToSnake);
}

/**
 * Type-safe version that preserves the structure but transforms keys
 * Usage: const result = transformKeys<MyType>(apiResponse, 'snakeToCamel');
 */
export function transformKeys<T>(
  obj: unknown,
  direction: 'snakeToCamel' | 'camelToSnake'
): T {
  const transformer = direction === 'snakeToCamel' ? snakeToCamelObject : camelToSnakeObject;
  return transformer(obj) as T;
}
