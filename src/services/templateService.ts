import { invoke } from '@tauri-apps/api';
import type {
  RecordTemplate,
  CreateRecordTemplateInput,
  UpdateRecordTemplateInput,
  RecordType,
} from '@/types/medical';

export class TemplateService {
  /**
   * Get all record templates, optionally filtered by record type
   */
  static async getRecordTemplates(recordType?: RecordType): Promise<RecordTemplate[]> {
    return invoke('get_record_templates', {
      recordType,
    });
  }

  /**
   * Search record templates by title/description
   */
  static async searchRecordTemplates(
    searchTerm: string,
    recordType?: RecordType
  ): Promise<RecordTemplate[]> {
    return invoke('search_record_templates', {
      searchTerm,
      recordType,
    });
  }

  /**
   * Create a new record template
   */
  static async createRecordTemplate(
    input: CreateRecordTemplateInput
  ): Promise<RecordTemplate> {
    return invoke('create_record_template', {
      input,
    });
  }

  /**
   * Update an existing record template
   */
  static async updateRecordTemplate(
    templateId: number,
    input: UpdateRecordTemplateInput
  ): Promise<RecordTemplate> {
    return invoke('update_record_template', {
      templateId,
      input,
    });
  }

  /**
   * Delete a record template
   */
  static async deleteRecordTemplate(templateId: number): Promise<void> {
    return invoke('delete_record_template', {
      templateId,
    });
  }
}
