import { describe, it, expect } from 'vitest';
import { snakeToCamelObject, camelToSnakeObject } from '../caseTransform';

describe('caseTransform', () => {
  it('passes a file\'s byte array through untouched instead of walking every byte', () => {
    const bytes = Array.from({ length: 1000 }, (_, i) => i % 256);

    expect(snakeToCamelObject({ file_data: bytes }).fileData).toBe(bytes);
    expect(camelToSnakeObject({ fileData: bytes }).file_data).toBe(bytes);
  });

  it('still renames keys inside arrays of objects', () => {
    expect(snakeToCamelObject({ line_items: [{ unit_price: 1 }] })).toEqual({ lineItems: [{ unitPrice: 1 }] });
  });
});
