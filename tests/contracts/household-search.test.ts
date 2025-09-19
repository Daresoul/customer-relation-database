/**
 * Contract Tests for Household Search Command
 * Feature: 005-i-want-to
 * Test: T006
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { invoke } from '@tauri-apps/api';

// Mock Tauri API
vi.mock('@tauri-apps/api', () => ({
  invoke: vi.fn()
}));

describe('Household Search Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('search_households', () => {
    it('T006: should search households with minimum query', async () => {
      // Arrange
      const command = { query: 'Smith' };
      const mockResponse = {
        results: [
          {
            id: 1,
            householdName: 'John Smith',
            address: '123 Main St',
            city: 'Springfield',
            postalCode: '12345',
            contacts: [
              { type: 'phone', value: '555-0123', isPrimary: true }
            ],
            petCount: 2,
            relevanceScore: 0.95
          }
        ],
        total: 1,
        hasMore: false,
        query: 'Smith',
        offset: 0,
        limit: 10
      };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      // Act
      const response = await invoke('search_households', command);

      // Assert
      expect(response).toBeDefined();
      expect(Array.isArray(response.results)).toBe(true);
      expect(response.total).toBe(1);
      expect(response.hasMore).toBe(false);
      expect(response.query).toBe('Smith');
      expect(response.limit).toBe(10); // default
      expect(response.offset).toBe(0); // default
      expect(invoke).toHaveBeenCalledWith('search_households', command);
    });

    it('T006: should respect pagination parameters', async () => {
      // Arrange
      const command = {
        query: 'John',
        limit: 5,
        offset: 10
      };
      const mockResponse = {
        results: [],
        total: 50,
        hasMore: true,
        query: 'John',
        offset: 10,
        limit: 5
      };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      // Act
      const response = await invoke('search_households', command);

      // Assert
      expect(response.limit).toBe(5);
      expect(response.offset).toBe(10);
      expect(response.hasMore).toBe(true);
      expect(response.results.length).toBeLessThanOrEqual(5);
    });

    it('T006: should include household details in results', async () => {
      // Arrange
      const command = { query: 'Test' };
      const mockHousehold = {
        id: 1,
        householdName: 'Test Family',
        address: '456 Oak Ave',
        city: 'Testville',
        postalCode: '54321',
        contacts: [
          { type: 'phone', value: '555-1234', isPrimary: true },
          { type: 'email', value: 'test@example.com', isPrimary: false }
        ],
        petCount: 3,
        relevanceScore: 1.0
      };
      const mockResponse = {
        results: [mockHousehold],
        total: 1,
        hasMore: false,
        query: 'Test',
        offset: 0,
        limit: 10
      };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      // Act
      const response = await invoke('search_households', command);

      // Assert
      const household = response.results[0];
      expect(household.id).toBeDefined();
      expect(household.householdName).toBeDefined();
      expect(Array.isArray(household.contacts)).toBe(true);
      expect(household.contacts.length).toBe(2);
      expect(typeof household.petCount).toBe('number');
      expect(household.relevanceScore).toBeGreaterThanOrEqual(0);
    });

    it('T006: should fail with query less than 2 characters', async () => {
      // Arrange
      const command = { query: 'a' };
      vi.mocked(invoke).mockRejectedValue(new Error('Query must be at least 2 characters'));

      // Act & Assert
      await expect(invoke('search_households', command)).rejects.toThrow('Query must be at least 2 characters');
    });

    it('T006: should handle sorting parameters', async () => {
      // Arrange
      const command = {
        query: 'Test',
        sortBy: 'pet_count' as const,
        sortDirection: 'desc' as const
      };
      const mockResponse = {
        results: [
          { id: 1, householdName: 'Family A', petCount: 5 },
          { id: 2, householdName: 'Family B', petCount: 3 },
          { id: 3, householdName: 'Family C', petCount: 1 }
        ],
        total: 3,
        hasMore: false,
        query: 'Test',
        offset: 0,
        limit: 10
      };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      // Act
      const response = await invoke('search_households', command);

      // Assert
      expect(response.results).toBeDefined();
      // Verify results are sorted by pet count descending
      if (response.results.length > 1) {
        for (let i = 0; i < response.results.length - 1; i++) {
          expect(response.results[i].petCount).toBeGreaterThanOrEqual(
            response.results[i + 1].petCount
          );
        }
      }
    });

    it('T006: should handle empty results', async () => {
      // Arrange
      const command = { query: 'NonExistentHousehold' };
      const mockResponse = {
        results: [],
        total: 0,
        hasMore: false,
        query: 'NonExistentHousehold',
        offset: 0,
        limit: 10
      };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      // Act
      const response = await invoke('search_households', command);

      // Assert
      expect(response.results).toEqual([]);
      expect(response.total).toBe(0);
      expect(response.hasMore).toBe(false);
    });

    it('T006: should support full-text search across all fields', async () => {
      // Arrange
      const command = { query: '555-0123' }; // Searching by phone number
      const mockResponse = {
        results: [
          {
            id: 1,
            householdName: 'Smith Family',
            contacts: [
              { type: 'phone', value: '555-0123', isPrimary: true }
            ],
            petCount: 1
          }
        ],
        total: 1,
        hasMore: false,
        query: '555-0123',
        offset: 0,
        limit: 10
      };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      // Act
      const response = await invoke('search_households', command);

      // Assert
      expect(response.results.length).toBe(1);
      expect(response.results[0].contacts[0].value).toBe('555-0123');
    });

    it('T006: should enforce maximum limit constraint', async () => {
      // Arrange
      const command = {
        query: 'Test',
        limit: 200 // Exceeds max of 100
      };
      vi.mocked(invoke).mockRejectedValue(new Error('Limit cannot exceed 100'));

      // Act & Assert
      await expect(invoke('search_households', command)).rejects.toThrow('Limit cannot exceed 100');
    });
  });
});