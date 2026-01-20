/**
 * Unit Tests for stringUtils Utility
 * Tests for string manipulation functions
 */

import { describe, it, expect } from 'vitest';
import { toTitleCase } from '../../src/utils/stringUtils';

describe('stringUtils Utility', () => {
  describe('toTitleCase', () => {
    it('capitalizes first letter of single word', () => {
      expect(toTitleCase('hello')).toBe('Hello');
    });

    it('capitalizes first letter of each word', () => {
      expect(toTitleCase('hello world')).toBe('Hello World');
    });

    it('handles multiple words', () => {
      expect(toTitleCase('the quick brown fox')).toBe('The Quick Brown Fox');
    });

    it('lowercases rest of word', () => {
      expect(toTitleCase('HELLO')).toBe('Hello');
    });

    it('lowercases rest of each word', () => {
      expect(toTitleCase('HELLO WORLD')).toBe('Hello World');
    });

    it('handles mixed case input', () => {
      expect(toTitleCase('hElLo WoRlD')).toBe('Hello World');
    });

    it('handles empty string', () => {
      expect(toTitleCase('')).toBe('');
    });

    it('handles single character', () => {
      expect(toTitleCase('a')).toBe('A');
    });

    it('handles single uppercase character', () => {
      expect(toTitleCase('A')).toBe('A');
    });

    it('handles multiple spaces between words', () => {
      expect(toTitleCase('hello  world')).toBe('Hello  World');
    });

    it('handles leading spaces', () => {
      expect(toTitleCase(' hello')).toBe(' Hello');
    });

    it('handles trailing spaces', () => {
      expect(toTitleCase('hello ')).toBe('Hello ');
    });

    it('handles string with only spaces', () => {
      expect(toTitleCase('   ')).toBe('   ');
    });

    it('handles numbers in string', () => {
      expect(toTitleCase('room 1')).toBe('Room 1');
    });

    it('handles words starting with numbers', () => {
      expect(toTitleCase('1st place')).toBe('1st Place');
    });

    it('handles special characters', () => {
      expect(toTitleCase("o'brien"  )).toBe("O'brien");
    });

    it('handles hyphenated words (treats as single word)', () => {
      // Note: hyphenated words are not split
      expect(toTitleCase('self-employed')).toBe('Self-employed');
    });

    it('handles unicode characters', () => {
      expect(toTitleCase('максим')).toBe('Максим');
    });

    it('handles common vet clinic terms', () => {
      expect(toTitleCase('exam room')).toBe('Exam Room');
      expect(toTitleCase('waiting area')).toBe('Waiting Area');
      expect(toTitleCase('surgery suite')).toBe('Surgery Suite');
    });

    it('handles species names', () => {
      expect(toTitleCase('dog')).toBe('Dog');
      expect(toTitleCase('CAT')).toBe('Cat');
      expect(toTitleCase('golden retriever')).toBe('Golden Retriever');
    });
  });
});
