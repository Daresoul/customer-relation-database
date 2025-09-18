/**
 * Owner-related API service functions
 */

import { ApiService } from './api';
import {
  Owner,
  OwnerWithPatients,
  CreateOwnerInput,
  UpdateOwnerInput
} from '../types';

export class OwnerService {
  /**
   * Get all owners
   */
  static async getOwners(): Promise<Owner[]> {
    return ApiService.invoke<Owner[]>('get_owners');
  }

  /**
   * Get owner with their patients
   */
  static async getOwnerWithPatients(id: number): Promise<OwnerWithPatients> {
    return ApiService.invoke<OwnerWithPatients>('get_owner_with_patients', { id });
  }

  /**
   * Create a new owner
   */
  static async createOwner(input: CreateOwnerInput): Promise<Owner> {
    return ApiService.invoke<Owner>('create_owner', { input });
  }

  /**
   * Update an existing owner
   */
  static async updateOwner(id: number, updates: UpdateOwnerInput): Promise<Owner> {
    return ApiService.invoke<Owner>('update_owner', { id, updates });
  }

  /**
   * Check if an owner can be deleted (has no patients)
   */
  static async canDeleteOwner(id: number): Promise<boolean> {
    return ApiService.invoke<boolean>('can_delete_owner', { id });
  }

  /**
   * Delete an owner (only if they have no patients)
   */
  static async deleteOwner(id: number): Promise<void> {
    return ApiService.invoke<void>('delete_owner', { id });
  }
}

export default OwnerService;