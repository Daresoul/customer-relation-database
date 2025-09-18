/**
 * Owner data management hook
 */

import { useState, useCallback, useEffect } from 'react';
import { Owner, OwnerWithPatients, CreateOwnerInput, UpdateOwnerInput, AsyncState } from '../types';
import { OwnerService } from '../services';

export function useOwners() {
  const [state, setState] = useState<AsyncState<Owner[]>>({
    data: null,
    loading: false,
    error: null
  });

  // Get all owners
  const getOwners = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const owners = await OwnerService.getOwners();
      setState({
        data: owners,
        loading: false,
        error: null,
        lastFetch: Date.now()
      });
      return owners;
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to load owners';
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage
      }));
      throw error;
    }
  }, []);

  // Get owner with patients
  const getOwnerWithPatients = useCallback(async (id: number): Promise<OwnerWithPatients> => {
    try {
      return await OwnerService.getOwnerWithPatients(id);
    } catch (error: any) {
      throw error;
    }
  }, []);

  // Create owner
  const createOwner = useCallback(async (input: CreateOwnerInput): Promise<Owner> => {
    try {
      const newOwner = await OwnerService.createOwner(input);

      // Update local state
      setState(prev => ({
        ...prev,
        data: prev.data ? [newOwner, ...prev.data] : [newOwner]
      }));

      return newOwner;
    } catch (error: any) {
      throw error;
    }
  }, []);

  // Update owner
  const updateOwner = useCallback(async (id: number, updates: UpdateOwnerInput): Promise<Owner> => {
    try {
      const updatedOwner = await OwnerService.updateOwner(id, updates);

      // Update local state
      setState(prev => ({
        ...prev,
        data: prev.data
          ? prev.data.map(owner => owner.id === id ? updatedOwner : owner)
          : [updatedOwner]
      }));

      return updatedOwner;
    } catch (error: any) {
      throw error;
    }
  }, []);

  // Check if owner can be deleted
  const canDeleteOwner = useCallback(async (id: number): Promise<boolean> => {
    try {
      return await OwnerService.canDeleteOwner(id);
    } catch (error: any) {
      throw error;
    }
  }, []);

  // Delete owner
  const deleteOwner = useCallback(async (id: number) => {
    try {
      // Check if owner can be deleted first
      const canDelete = await canDeleteOwner(id);
      if (!canDelete) {
        throw new Error('Cannot delete owner: they have associated patients');
      }

      await OwnerService.deleteOwner(id);

      // Update local state
      setState(prev => ({
        ...prev,
        data: prev.data ? prev.data.filter(owner => owner.id !== id) : null
      }));
    } catch (error: any) {
      throw error;
    }
  }, [canDeleteOwner]);

  // Refresh owners data
  const refreshOwners = useCallback(() => {
    return getOwners();
  }, [getOwners]);

  // Auto-fetch on mount
  useEffect(() => {
    getOwners();
  }, [getOwners]);

  return {
    owners: state.data || [],
    loading: state.loading,
    error: state.error,
    lastFetch: state.lastFetch,
    getOwners,
    getOwnerWithPatients,
    createOwner,
    updateOwner,
    canDeleteOwner,
    deleteOwner,
    refreshOwners
  };
}

export default useOwners;