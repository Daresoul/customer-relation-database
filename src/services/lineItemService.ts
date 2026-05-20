import { ApiService } from './api';
import {
  LineItemTemplate,
  CreateLineItemTemplateInput,
  UpdateLineItemTemplateInput
} from '../types/lineItem';

export class LineItemService {
  /**
   * Get all line item templates
   * @param activeOnly - If true, only return active templates (default: true)
   */
  static async getTemplates(activeOnly?: boolean): Promise<LineItemTemplate[]> {
    return ApiService.invoke<LineItemTemplate[]>('get_line_item_templates', { activeOnly });
  }

  /**
   * Get a single line item template by ID
   */
  static async getTemplate(id: number): Promise<LineItemTemplate> {
    return ApiService.invoke<LineItemTemplate>('get_line_item_template', { id });
  }

  /**
   * Create a new line item template
   */
  static async createTemplate(data: CreateLineItemTemplateInput): Promise<LineItemTemplate> {
    return ApiService.invoke<LineItemTemplate>('create_line_item_template', { input: data });
  }

  /**
   * Update an existing line item template
   */
  static async updateTemplate(id: number, data: UpdateLineItemTemplateInput): Promise<LineItemTemplate> {
    return ApiService.invoke<LineItemTemplate>('update_line_item_template', { id, input: data });
  }

  /**
   * Delete a line item template (soft delete - sets is_active = false)
   */
  static async deleteTemplate(id: number): Promise<void> {
    return ApiService.invoke<void>('delete_line_item_template', { id });
  }
}
