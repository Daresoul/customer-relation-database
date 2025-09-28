/**
 * Hook for managing households
 */

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api';
import { HouseholdSearchResult } from '../types';

export const useHouseholds = () => {
  const [households, setHouseholds] = useState<HouseholdSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHouseholds = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);


      // Get all households directly without search
      const householdsWithPeople = await invoke<any[]>('get_all_households', {
        limit: 100,
        offset: 0
      });


      // Convert the response to our format
      const householdResults = householdsWithPeople.map((hwp: any) => ({
        id: hwp.household?.id || hwp.id,
        householdName: hwp.household?.household_name || hwp.household_name || 'Unnamed Household',
        address: hwp.household?.address || hwp.address,
        city: undefined,
        postalCode: undefined,
        contacts: hwp.people?.flatMap((person: any) =>
          person.contacts?.map((contact: any) => ({
            type: contact.contact_type as 'phone' | 'email' | 'mobile' | 'work',
            value: contact.contact_value,
            isPrimary: contact.is_primary
          })) || []
        ) || [],
        petCount: hwp.pet_count || hwp.petCount || 0,
        relevanceScore: 1.0
      }));

      setHouseholds(householdResults);
    } catch (err) {
      console.error('Failed to load households - Full error:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('Error message:', errorMessage);
      setError(errorMessage);
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