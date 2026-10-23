import { describe, it, expect } from 'vitest';
import { messageOf } from '../errors';

describe('messageOf', () => {
  it('gives the message of an Error', () => {
    expect(messageOf(new Error('disk full'))).toBe('disk full');
  });

  it('gives the message of a plain object with one', () => {
    expect(messageOf({ message: 'backend said no' })).toBe('backend said no');
  });

  it('gives nothing for a string, null or a non-text message', () => {
    expect(messageOf('raw text')).toBeUndefined();
    expect(messageOf(null)).toBeUndefined();
    expect(messageOf(undefined)).toBeUndefined();
    expect(messageOf({ message: 42 })).toBeUndefined();
  });
});
