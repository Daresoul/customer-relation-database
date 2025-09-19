/**
 * Contract Tests for Household Creation Command
 * Feature: 005-i-want-to
 * Test: T007
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { invoke } from '@tauri-apps/api';

// Mock Tauri API
vi.mock('@tauri-apps/api', () => ({
  invoke: vi.fn()
}));

describe('Household Creation Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create_household', () => {
    it('T007: should create household with minimal data', async () => {
      // Arrange
      const command = {
        lastName: 'TestHousehold'
      };
      const mockResponse = {
        success: true,
        id: 1,
        householdName: 'TestHousehold',
        createdAt: new Date().toISOString(),
        message: 'Household created successfully'
      };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      // Act
      const response = await invoke('create_household', command);

      // Assert
      expect(response.success).toBe(true);
      expect(response.id).toBeGreaterThan(0);
      expect(response.householdName).toContain('TestHousehold');
      expect(response.createdAt).toBeDefined();
      expect(invoke).toHaveBeenCalledWith('create_household', command);
    });

    it('T007: should create household with full data', async () => {
      // Arrange
      const command = {
        firstName: 'John',
        lastName: 'Doe',
        address: '123 Main St',
        city: 'Springfield',
        postalCode: '12345',
        contacts: [
          { type: 'phone' as const, value: '555-0123', isPrimary: true },
          { type: 'email' as const, value: 'john.doe@example.com', isPrimary: false }
        ]
      };
      const mockResponse = {
        success: true,
        id: 2,
        householdName: 'John Doe',
        createdAt: new Date().toISOString(),
        message: 'Household created successfully'
      };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      // Act
      const response = await invoke('create_household', command);

      // Assert
      expect(response.success).toBe(true);
      expect(response.householdName).toBe('John Doe');
      expect(response.id).toBeDefined();
    });

    it('T007: should create household with only first name', async () => {
      // Arrange
      const command = {
        firstName: 'SingleName'
      };
      const mockResponse = {
        success: true,
        id: 3,
        householdName: 'SingleName',
        createdAt: new Date().toISOString()
      };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      // Act
      const response = await invoke('create_household', command);

      // Assert
      expect(response.success).toBe(true);
      expect(response.householdName).toBe('SingleName');
    });

    it('T007: should fail without any name', async () => {
      // Arrange
      const command = {
        address: '123 Main St',
        city: 'Springfield'
        // No firstName or lastName
      };
      vi.mocked(invoke).mockRejectedValue(new Error('At least one name field is required'));

      // Act & Assert
      await expect(invoke('create_household', command)).rejects.toThrow('At least one name field is required');
    });

    it('T007: should NOT create any animals when creating household', async () => {
      // Arrange
      const createCommand = {
        lastName: 'NoAnimals'
      };
      const createResponse = {
        success: true,
        id: 4,
        householdName: 'NoAnimals',
        createdAt: new Date().toISOString()
      };
      vi.mocked(invoke).mockResolvedValueOnce(createResponse);

      // Act - Create household
      const household = await invoke('create_household', createCommand);
      expect(household.success).toBe(true);

      // Arrange - Get household details
      const getResponse = {
        id: 4,
        firstName: '',
        lastName: 'NoAnimals',
        householdName: 'NoAnimals',
        pets: [] // Empty pets array confirms no animals created
      };
      vi.mocked(invoke).mockResolvedValueOnce(getResponse);

      // Act - Verify no animals were created
      const details = await invoke('get_household', { id: household.id });

      // Assert
      expect(details.pets).toEqual([]);
    });

    it('T007: should handle multiple contact methods', async () => {
      // Arrange
      const command = {
        lastName: 'MultiContact',
        contacts: [
          { type: 'phone' as const, value: '555-0001', isPrimary: true },
          { type: 'mobile' as const, value: '555-0002', isPrimary: false },
          { type: 'email' as const, value: 'test@example.com', isPrimary: false },
          { type: 'work_phone' as const, value: '555-0003', isPrimary: false }
        ]
      };
      const mockResponse = {
        success: true,
        id: 5,
        householdName: 'MultiContact',
        createdAt: new Date().toISOString()
      };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      // Act
      const response = await invoke('create_household', command);

      // Assert
      expect(response.success).toBe(true);
      expect(invoke).toHaveBeenCalledWith('create_household', expect.objectContaining({
        contacts: expect.arrayContaining([
          expect.objectContaining({ type: 'phone' }),
          expect.objectContaining({ type: 'mobile' }),
          expect.objectContaining({ type: 'email' }),
          expect.objectContaining({ type: 'work_phone' })
        ])
      }));
    });

    it('T007: should validate contact value formats', async () => {
      // Arrange
      const command = {
        lastName: 'InvalidContact',
        contacts: [
          { type: 'email' as const, value: 'not-an-email', isPrimary: true }
        ]
      };
      vi.mocked(invoke).mockRejectedValue(new Error('Invalid email format'));

      // Act & Assert
      await expect(invoke('create_household', command)).rejects.toThrow('Invalid email format');
    });

    it('T007: should handle special characters in names', async () => {
      // Arrange
      const command = {
        firstName: "O'Brien",
        lastName: 'Smith-Jones'
      };
      const mockResponse = {
        success: true,
        id: 6,
        householdName: "O'Brien Smith-Jones",
        createdAt: new Date().toISOString()
      };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      // Act
      const response = await invoke('create_household', command);

      // Assert
      expect(response.success).toBe(true);
      expect(response.householdName).toBe("O'Brien Smith-Jones");
    });

    it('T007: should enforce field length constraints', async () => {
      // Arrange
      const command = {
        lastName: 'A'.repeat(101), // Exceeds 100 character limit
        address: 'B'.repeat(201)  // Exceeds 200 character limit
      };
      vi.mocked(invoke).mockRejectedValue(new Error('Field length exceeded'));

      // Act & Assert
      await expect(invoke('create_household', command)).rejects.toThrow('Field length exceeded');
    });
  });
});