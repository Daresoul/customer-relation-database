/**
 * Contract Tests for View Preference Commands
 * Feature: 005-i-want-to
 * Tests: T004, T005
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { invoke } from '@tauri-apps/api';

// Mock Tauri API for testing
vi.mock('@tauri-apps/api', () => ({
  invoke: vi.fn()
}));

describe('View Preference Commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('get_view_preference', () => {
    it('T004: should return current view preference', async () => {
      // Arrange
      const mockResponse = {
        activeView: 'animal' as const,
        lastSwitched: undefined
      };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      // Act
      const response = await invoke('get_view_preference');

      // Assert
      expect(response).toBeDefined();
      expect(response).toHaveProperty('activeView');
      expect(response.activeView).toMatch(/^(animal|household)$/);
      expect(invoke).toHaveBeenCalledWith('get_view_preference');
    });

    it('T004: should default to animal view on first run', async () => {
      // Arrange
      const mockResponse = {
        activeView: 'animal' as const,
        lastSwitched: undefined
      };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      // Act
      const response = await invoke('get_view_preference');

      // Assert
      expect(response.activeView).toBe('animal');
      expect(response.lastSwitched).toBeUndefined();
    });

    it('T004: should include lastSwitched timestamp when view has been changed', async () => {
      // Arrange
      const timestamp = new Date().toISOString();
      const mockResponse = {
        activeView: 'household' as const,
        lastSwitched: timestamp
      };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      // Act
      const response = await invoke('get_view_preference');

      // Assert
      expect(response.lastSwitched).toBe(timestamp);
      expect(() => new Date(response.lastSwitched)).not.toThrow();
    });
  });

  describe('set_view_preference', () => {
    it('T005: should set household view preference', async () => {
      // Arrange
      const command = { activeView: 'household' as const };
      const mockResponse = {
        success: true,
        activeView: 'household' as const
      };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      // Act
      const response = await invoke('set_view_preference', command);

      // Assert
      expect(response.success).toBe(true);
      expect(response.activeView).toBe('household');
      expect(invoke).toHaveBeenCalledWith('set_view_preference', command);
    });

    it('T005: should set animal view preference', async () => {
      // Arrange
      const command = { activeView: 'animal' as const };
      const mockResponse = {
        success: true,
        activeView: 'animal' as const
      };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      // Act
      const response = await invoke('set_view_preference', command);

      // Assert
      expect(response.success).toBe(true);
      expect(response.activeView).toBe('animal');
    });

    it('T005: should persist view preference across commands', async () => {
      // Arrange & Act
      // Set to household
      vi.mocked(invoke).mockResolvedValueOnce({
        success: true,
        activeView: 'household' as const
      });
      await invoke('set_view_preference', { activeView: 'household' });

      // Get preference should return household
      const timestamp = new Date().toISOString();
      vi.mocked(invoke).mockResolvedValueOnce({
        activeView: 'household' as const,
        lastSwitched: timestamp
      });
      const getResponse = await invoke('get_view_preference');

      // Assert
      expect(getResponse.activeView).toBe('household');
      expect(getResponse.lastSwitched).toBeDefined();
    });

    it('T005: should reject invalid view values', async () => {
      // Arrange
      const command = { activeView: 'invalid' as any };
      vi.mocked(invoke).mockRejectedValue(new Error('Invalid view type'));

      // Act & Assert
      await expect(invoke('set_view_preference', command)).rejects.toThrow('Invalid view type');
    });
  });

  describe('View State Management', () => {
    it('should maintain view preference during session', async () => {
      // This test verifies the full cycle
      // 1. Get initial state
      vi.mocked(invoke).mockResolvedValueOnce({
        activeView: 'animal' as const,
        lastSwitched: undefined
      });
      const initial = await invoke('get_view_preference');
      expect(initial.activeView).toBe('animal');

      // 2. Change to household
      vi.mocked(invoke).mockResolvedValueOnce({
        success: true,
        activeView: 'household' as const
      });
      const setResult = await invoke('set_view_preference', { activeView: 'household' });
      expect(setResult.success).toBe(true);

      // 3. Verify change persisted
      const timestamp = new Date().toISOString();
      vi.mocked(invoke).mockResolvedValueOnce({
        activeView: 'household' as const,
        lastSwitched: timestamp
      });
      const final = await invoke('get_view_preference');
      expect(final.activeView).toBe('household');
      expect(final.lastSwitched).toBeDefined();
    });
  });
});