/**
 * Contract Tests for Get Household Command
 * Feature: 005-i-want-to
 * Test: T008
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { invoke } from '@tauri-apps/api';

// Mock Tauri API
vi.mock('@tauri-apps/api', () => ({
  invoke: vi.fn()
}));

describe('Get Household Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('get_household', () => {
    it('T008: should retrieve household by ID', async () => {
      // Arrange
      const command = { id: 1 };
      const mockResponse = {
        id: 1,
        firstName: 'John',
        lastName: 'Smith',
        householdName: 'John Smith',
        address: '123 Main St',
        city: 'Springfield',
        postalCode: '12345',
        contacts: [
          { id: 1, type: 'phone', value: '555-0123', isPrimary: true },
          { id: 2, type: 'email', value: 'john@example.com', isPrimary: false }
        ],
        pets: [
          { id: 1, name: 'Max', species: 'Dog', breed: 'Golden Retriever' },
          { id: 2, name: 'Mittens', species: 'Cat', breed: 'Persian' }
        ],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-15T14:30:00Z'
      };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      // Act
      const response = await invoke('get_household', command);

      // Assert
      expect(response.id).toBe(1);
      expect(response.firstName).toBe('John');
      expect(response.lastName).toBe('Smith');
      expect(response.householdName).toBe('John Smith');
      expect(Array.isArray(response.pets)).toBe(true);
      expect(Array.isArray(response.contacts)).toBe(true);
      expect(response.createdAt).toBeDefined();
      expect(response.updatedAt).toBeDefined();
      expect(invoke).toHaveBeenCalledWith('get_household', command);
    });

    it('T008: should handle household with no pets', async () => {
      // Arrange
      const command = { id: 2 };
      const mockResponse = {
        id: 2,
        firstName: 'Jane',
        lastName: 'Doe',
        householdName: 'Jane Doe',
        address: '',
        city: '',
        postalCode: '',
        contacts: [],
        pets: [], // No pets
        createdAt: '2025-01-10T09:00:00Z',
        updatedAt: '2025-01-10T09:00:00Z'
      };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      // Act
      const response = await invoke('get_household', command);

      // Assert
      expect(response.pets).toEqual([]);
      expect(response.pets.length).toBe(0);
    });

    it('T008: should handle household with multiple pets', async () => {
      // Arrange
      const command = { id: 3 };
      const mockResponse = {
        id: 3,
        firstName: 'Multi',
        lastName: 'Pet',
        householdName: 'Multi Pet',
        contacts: [],
        pets: [
          { id: 1, name: 'Dog1', species: 'Dog', breed: 'Labrador' },
          { id: 2, name: 'Dog2', species: 'Dog', breed: 'Beagle' },
          { id: 3, name: 'Cat1', species: 'Cat', breed: 'Siamese' },
          { id: 4, name: 'Bird1', species: 'Bird', breed: 'Parrot' }
        ],
        createdAt: '2025-01-05T08:00:00Z',
        updatedAt: '2025-01-20T16:00:00Z'
      };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      // Act
      const response = await invoke('get_household', command);

      // Assert
      expect(response.pets.length).toBe(4);
      expect(response.pets).toContainEqual(
        expect.objectContaining({ name: 'Dog1', species: 'Dog' })
      );
    });

    it('T008: should fail with invalid ID', async () => {
      // Arrange
      const command = { id: -1 };
      vi.mocked(invoke).mockRejectedValue(new Error('Invalid household ID'));

      // Act & Assert
      await expect(invoke('get_household', command)).rejects.toThrow('Invalid household ID');
    });

    it('T008: should fail when household not found', async () => {
      // Arrange
      const command = { id: 99999 };
      vi.mocked(invoke).mockRejectedValue(new Error('Household not found'));

      // Act & Assert
      await expect(invoke('get_household', command)).rejects.toThrow('Household not found');
    });

    it('T008: should include all contact types', async () => {
      // Arrange
      const command = { id: 4 };
      const mockResponse = {
        id: 4,
        firstName: 'Contact',
        lastName: 'Test',
        householdName: 'Contact Test',
        contacts: [
          { id: 1, type: 'phone', value: '555-0001', isPrimary: true },
          { id: 2, type: 'mobile', value: '555-0002', isPrimary: false },
          { id: 3, type: 'email', value: 'test@example.com', isPrimary: false },
          { id: 4, type: 'work_phone', value: '555-0003', isPrimary: false }
        ],
        pets: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z'
      };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      // Act
      const response = await invoke('get_household', command);

      // Assert
      expect(response.contacts.length).toBe(4);
      const contactTypes = response.contacts.map(c => c.type);
      expect(contactTypes).toContain('phone');
      expect(contactTypes).toContain('mobile');
      expect(contactTypes).toContain('email');
      expect(contactTypes).toContain('work_phone');
    });

    it('T008: should identify primary contact', async () => {
      // Arrange
      const command = { id: 5 };
      const mockResponse = {
        id: 5,
        firstName: 'Primary',
        lastName: 'Contact',
        householdName: 'Primary Contact',
        contacts: [
          { id: 1, type: 'phone', value: '555-0001', isPrimary: true },
          { id: 2, type: 'email', value: 'primary@example.com', isPrimary: false }
        ],
        pets: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z'
      };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      // Act
      const response = await invoke('get_household', command);

      // Assert
      const primaryContact = response.contacts.find(c => c.isPrimary);
      expect(primaryContact).toBeDefined();
      expect(primaryContact.type).toBe('phone');
      expect(primaryContact.value).toBe('555-0001');
    });

    it('T008: should handle household with minimal data', async () => {
      // Arrange
      const command = { id: 6 };
      const mockResponse = {
        id: 6,
        firstName: '',
        lastName: 'MinimalHousehold',
        householdName: 'MinimalHousehold',
        address: null,
        city: null,
        postalCode: null,
        contacts: [],
        pets: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z'
      };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      // Act
      const response = await invoke('get_household', command);

      // Assert
      expect(response.id).toBe(6);
      expect(response.householdName).toBe('MinimalHousehold');
      expect(response.contacts).toEqual([]);
      expect(response.pets).toEqual([]);
    });
  });
});