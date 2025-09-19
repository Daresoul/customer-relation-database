/**
 * Hook for managing households (owners)
 */

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api';
import { HouseholdSearchResult } from '../types';

interface Owner {
  id: number;
  first_name: string;  // Note: Rust sends snake_case
  last_name: string;   // Note: Rust sends snake_case
  address?: string;
  email?: string;
  phone?: string;
  created_at?: string; // Note: Rust sends snake_case
  updated_at?: string; // Note: Rust sends snake_case
}

export const useHouseholds = () => {
  const [households, setHouseholds] = useState<HouseholdSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Convert owner to household search result format
  const ownerToHousehold = (owner: Owner): HouseholdSearchResult => {
    const contacts = [];

    if (owner.phone) {
      contacts.push({
        type: 'phone' as const,
        value: owner.phone,
        isPrimary: true
      });
    }

    if (owner.email) {
      contacts.push({
        type: 'email' as const,
        value: owner.email,
        isPrimary: !owner.phone
      });
    }

    return {
      id: owner.id,
      householdName: `${owner.first_name || ''} ${owner.last_name || ''}`.trim() || 'Unnamed Household',
      address: owner.address,
      city: undefined, // Would need to parse from address
      postalCode: undefined, // Would need to parse from address
      contacts,
      petCount: 0, // Would need to fetch separately
      relevanceScore: 1.0
    };
  };

  const loadHouseholds = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('Loading households...');

      // Get all owners (households)
      const owners = await invoke<Owner[]>('get_owners');
      console.log('Loaded owners:', owners);

      // Convert to household format
      const householdResults = owners.map(ownerToHousehold);
      console.log('Converted to households:', householdResults);

      setHouseholds(householdResults);
    } catch (err) {
      console.error('Failed to load households:', err);
      setError(err instanceof Error ? err.message : 'Failed to load households');
      setHouseholds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load households on mount
  useEffect(() => {
    loadHouseholds();
  }, [loadHouseholds]);

  const refreshHouseholds = useCallback(() => {
    loadHouseholds();
  }, [loadHouseholds]);

  return {
    households,
    loading,
    error,
    refreshHouseholds
  };
};