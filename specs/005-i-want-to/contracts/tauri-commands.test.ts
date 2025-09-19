/**
 * Contract Tests for View Switching Tauri Commands
 * Feature: 005-i-want-to
 *
 * These tests verify the contract between frontend and backend
 * They should FAIL initially (TDD approach)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api';
import type {
  GetViewPreferenceResponse,
  SetViewPreferenceCommand,
  SetViewPreferenceResponse,
  SearchHouseholdsCommand,
  SearchHouseholdsResponse,
  CreateHouseholdCommand,
  CreateHouseholdResponse,
  GetHouseholdCommand,
  GetHouseholdResponse,
  SearchAnimalsCommand,
  SearchAnimalsResponse,
} from './tauri-commands';

describe('View State Commands', () => {
  describe('get_view_preference', () => {
    it('should return current view preference', async () => {
      const response = await invoke<GetViewPreferenceResponse>('get_view_preference');

      expect(response).toBeDefined();
      expect(response.activeView).toMatch(/^(animal|household)$/);
      if (response.lastSwitched) {
        expect(() => new Date(response.lastSwitched)).not.toThrow();
      }
    });

    it('should default to animal view on first run', async () => {
      // Assumes fresh state
      const response = await invoke<GetViewPreferenceResponse>('get_view_preference');
      expect(response.activeView).toBe('animal');
      expect(response.lastSwitched).toBeUndefined();
    });
  });

  describe('set_view_preference', () => {
    it('should set household view preference', async () => {
      const command: SetViewPreferenceCommand = {
        activeView: 'household'
      };

      const response = await invoke<SetViewPreferenceResponse>('set_view_preference', command);

      expect(response.success).toBe(true);
      expect(response.activeView).toBe('household');
    });

    it('should set animal view preference', async () => {
      const command: SetViewPreferenceCommand = {
        activeView: 'animal'
      };

      const response = await invoke<SetViewPreferenceResponse>('set_view_preference', command);

      expect(response.success).toBe(true);
      expect(response.activeView).toBe('animal');
    });

    it('should persist view preference across commands', async () => {
      // Set to household
      await invoke<SetViewPreferenceResponse>('set_view_preference', {
        activeView: 'household'
      });

      // Get preference should return household
      const response = await invoke<GetViewPreferenceResponse>('get_view_preference');
      expect(response.activeView).toBe('household');
      expect(response.lastSwitched).toBeDefined();
    });
  });
});

describe('Household Search Commands', () => {
  describe('search_households', () => {
    it('should search households with minimum query', async () => {
      const command: SearchHouseholdsCommand = {
        query: 'Smith'
      };

      const response = await invoke<SearchHouseholdsResponse>('search_households', command);

      expect(response).toBeDefined();
      expect(Array.isArray(response.results)).toBe(true);
      expect(typeof response.total).toBe('number');
      expect(typeof response.hasMore).toBe('boolean');
      expect(response.query).toBe('Smith');
      expect(response.limit).toBe(10); // default
      expect(response.offset).toBe(0); // default
    });

    it('should respect pagination parameters', async () => {
      const command: SearchHouseholdsCommand = {
        query: 'John',
        limit: 5,
        offset: 10
      };

      const response = await invoke<SearchHouseholdsResponse>('search_households', command);

      expect(response.limit).toBe(5);
      expect(response.offset).toBe(10);
      expect(response.results.length).toBeLessThanOrEqual(5);
    });

    it('should include household details in results', async () => {
      const command: SearchHouseholdsCommand = {
        query: 'Test'
      };

      const response = await invoke<SearchHouseholdsResponse>('search_households', command);

      if (response.results.length > 0) {
        const household = response.results[0];
        expect(household.id).toBeDefined();
        expect(household.householdName).toBeDefined();
        expect(Array.isArray(household.contacts)).toBe(true);
        expect(typeof household.petCount).toBe('number');
      }
    });

    it('should fail with query less than 2 characters', async () => {
      const command: SearchHouseholdsCommand = {
        query: 'a'
      };

      await expect(
        invoke<SearchHouseholdsResponse>('search_households', command)
      ).rejects.toThrow();
    });

    it('should handle sorting parameters', async () => {
      const command: SearchHouseholdsCommand = {
        query: 'Test',
        sortBy: 'pet_count',
        sortDirection: 'desc'
      };

      const response = await invoke<SearchHouseholdsResponse>('search_households', command);

      expect(response).toBeDefined();
      // Verify results are sorted by pet count descending
      if (response.results.length > 1) {
        for (let i = 0; i < response.results.length - 1; i++) {
          expect(response.results[i].petCount).toBeGreaterThanOrEqual(
            response.results[i + 1].petCount
          );
        }
      }
    });
  });
});

describe('Household Creation Commands', () => {
  describe('create_household', () => {
    it('should create household with minimal data', async () => {
      const command: CreateHouseholdCommand = {
        lastName: 'TestHousehold'
      };

      const response = await invoke<CreateHouseholdResponse>('create_household', command);

      expect(response.success).toBe(true);
      expect(response.id).toBeGreaterThan(0);
      expect(response.householdName).toContain('TestHousehold');
      expect(response.createdAt).toBeDefined();
    });

    it('should create household with full data', async () => {
      const command: CreateHouseholdCommand = {
        firstName: 'John',
        lastName: 'Doe',
        address: '123 Main St',
        city: 'Springfield',
        postalCode: '12345',
        contacts: [
          { type: 'phone', value: '555-0123', isPrimary: true },
          { type: 'email', value: 'john.doe@example.com' }
        ]
      };

      const response = await invoke<CreateHouseholdResponse>('create_household', command);

      expect(response.success).toBe(true);
      expect(response.householdName).toBe('John Doe');
    });

    it('should fail without any name', async () => {
      const command: CreateHouseholdCommand = {
        address: '123 Main St'
      };

      await expect(
        invoke<CreateHouseholdResponse>('create_household', command)
      ).rejects.toThrow();
    });

    it('should not create any animals', async () => {
      const command: CreateHouseholdCommand = {
        lastName: 'NoAnimals'
      };

      const createResponse = await invoke<CreateHouseholdResponse>('create_household', command);
      expect(createResponse.success).toBe(true);

      // Verify no animals were created
      const getCommand: GetHouseholdCommand = { id: createResponse.id };
      const household = await invoke<GetHouseholdResponse>('get_household', getCommand);

      expect(household.pets).toEqual([]);
    });
  });

  describe('get_household', () => {
    it('should retrieve household by ID', async () => {
      // First create a household
      const createResponse = await invoke<CreateHouseholdResponse>('create_household', {
        firstName: 'Get',
        lastName: 'Test'
      });

      // Then retrieve it
      const command: GetHouseholdCommand = { id: createResponse.id };
      const response = await invoke<GetHouseholdResponse>('get_household', command);

      expect(response.id).toBe(createResponse.id);
      expect(response.firstName).toBe('Get');
      expect(response.lastName).toBe('Test');
      expect(response.householdName).toBe('Get Test');
      expect(Array.isArray(response.pets)).toBe(true);
      expect(Array.isArray(response.contacts)).toBe(true);
    });

    it('should fail with invalid ID', async () => {
      const command: GetHouseholdCommand = { id: -1 };

      await expect(
        invoke<GetHouseholdResponse>('get_household', command)
      ).rejects.toThrow();
    });
  });
});

describe('Animal Search Commands (Existing)', () => {
  describe('search_animals', () => {
    it('should search animals independently from households', async () => {
      const command: SearchAnimalsCommand = {
        query: 'Max'
      };

      const response = await invoke<SearchAnimalsResponse>('search_animals', command);

      expect(response).toBeDefined();
      expect(Array.isArray(response.results)).toBe(true);

      if (response.results.length > 0) {
        const animal = response.results[0];
        expect(animal.id).toBeDefined();
        expect(animal.name).toBeDefined();
        expect(animal.species).toBeDefined();
      }
    });

    it('should maintain separate search state from household search', async () => {
      // Search households
      const householdResponse = await invoke<SearchHouseholdsResponse>('search_households', {
        query: 'Smith'
      });

      // Search animals
      const animalResponse = await invoke<SearchAnimalsResponse>('search_animals', {
        query: 'Fluffy'
      });

      // Results should be independent
      expect(householdResponse.query).toBe('Smith');
      expect(animalResponse.query).toBe('Fluffy');
    });
  });
});

describe('View State Persistence', () => {
  it('should maintain separate search states per view', async () => {
    // Set to household view
    await invoke('set_view_preference', { activeView: 'household' });

    // Search in household view
    const householdSearch = await invoke<SearchHouseholdsResponse>('search_households', {
      query: 'Johnson',
      offset: 20
    });

    // Switch to animal view
    await invoke('set_view_preference', { activeView: 'animal' });

    // Search in animal view
    const animalSearch = await invoke<SearchAnimalsResponse>('search_animals', {
      query: 'Rex',
      offset: 10
    });

    // Switch back to household view
    await invoke('set_view_preference', { activeView: 'household' });

    // Verify states are independent
    expect(householdSearch.offset).toBe(20);
    expect(animalSearch.offset).toBe(10);
  });
});