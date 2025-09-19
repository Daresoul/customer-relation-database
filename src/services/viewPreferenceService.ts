/**
 * Service for managing view preferences
 */

import { ApiService } from './api';
import { ViewPreference, SetViewPreferenceCommand, SetViewPreferenceResponse, ViewType } from '../types';

export class ViewPreferenceService {
  /**
   * Get the current view preference
   */
  static async getViewPreference(): Promise<ViewPreference> {
    return ApiService.invoke<ViewPreference>('get_view_preference');
  }

  /**
   * Set the current view preference
   */
  static async setViewPreference(activeView: ViewType): Promise<SetViewPreferenceResponse> {
    const command: SetViewPreferenceCommand = { activeView };
    return ApiService.invoke<SetViewPreferenceResponse>('set_view_preference', command);
  }

  /**
   * Switch to animal view
   */
  static async switchToAnimalView(): Promise<SetViewPreferenceResponse> {
    return this.setViewPreference('animal');
  }

  /**
   * Switch to household view
   */
  static async switchToHouseholdView(): Promise<SetViewPreferenceResponse> {
    return this.setViewPreference('household');
  }
}

export default ViewPreferenceService;