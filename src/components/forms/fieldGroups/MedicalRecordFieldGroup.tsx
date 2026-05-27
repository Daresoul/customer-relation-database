/**
 * MedicalRecordFieldGroup - Reusable medical record form fields
 *
 * Extracts common fields shared between MedicalRecordForm and DeviceImportModal
 * for consistency and reduced code duplication.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Form,
  Input,
  Select,
  AutoComplete,
  Spin,
} from 'antd';
import type { FormInstance } from 'antd';
import type { RecordType, Currency, RecordTemplate } from '@/types/medical';

const { TextArea } = Input;
const { Option } = Select;

// Re-export types for consumers
export type { RecordType, Currency, RecordTemplate };

export interface MedicalRecordFieldGroupProps {
  form: FormInstance;
  recordType: RecordType;
  onRecordTypeChange: (type: RecordType) => void;
  /** @deprecated Price is now handled via Line Items */
  currencies?: Currency[];
  templates?: RecordTemplate[];
  isSearchingTemplates?: boolean;
  onTemplateSearch?: (term: string) => void;
  onTemplateSelect?: (template: RecordTemplate) => void;
  disabled?: boolean;
  /** Hide record type select - useful for edit mode */
  hideRecordType?: boolean;
  /** Title field label override */
  titleLabel?: string;
  /** Title field placeholder override */
  titlePlaceholder?: string;
}

export const MedicalRecordFieldGroup: React.FC<MedicalRecordFieldGroupProps> = ({
  form,
  recordType,
  onRecordTypeChange,
  templates = [],
  isSearchingTemplates = false,
  onTemplateSearch,
  onTemplateSelect,
  disabled = false,
  hideRecordType = false,
  titleLabel,
  titlePlaceholder,
}) => {
  const { t } = useTranslation(['medical', 'common', 'forms']);

  // Handle record type change
  const handleRecordTypeChange = (value: RecordType) => {
    onRecordTypeChange(value);
    if (value === 'note' || value === 'test_result') {
      form.setFieldValue('procedureName', undefined);
    }
  };

  // Handle template selection from autocomplete.
  //
  // The previous implementation matched `templates.find(t => t.title === value)`
  // — fragile for two reasons:
  //   1. Title equality is strict: trailing whitespace, casing, or
  //      invisible characters cause "select fires but nothing applies"
  //      because no template matches.
  //   2. Multiple templates can share a title (the schema doesn't
  //      enforce uniqueness on `title` alone), in which case
  //      Array.find returns the first match and silently applies the
  //      wrong template's description/lineItems.
  //
  // AntD's AutoComplete passes the full option object as the second
  // arg to onSelect, so we stash the template id there and look up
  // by id first. Title-based lookup remains as a defensive fallback.
  const handleTemplateSelect = (value: string, option?: { templateId?: number }) => {
    const template =
      (option?.templateId != null
        ? templates.find(t => t.id === option.templateId)
        : undefined) ?? templates.find(t => t.title === value);
    if (template) {
      form.setFieldsValue({
        name: template.title,
        description: template.description,
      });
      onTemplateSelect?.(template);
    }
  };

  // Determine labels based on record type
  const getFieldLabel = () => {
    if (titleLabel) return titleLabel;
    return recordType === 'procedure'
      ? t('medical:fields.procedureName')
      : t('medical:fields.title');
  };

  const getFieldPlaceholder = () => {
    if (titlePlaceholder) return titlePlaceholder;
    return recordType === 'procedure'
      ? t('medical:placeholders.procedureName')
      : t('medical:placeholders.noteTitle');
  };

  // Build autocomplete options from templates. `templateId` is a custom
  // field on the option object — AntD's AutoComplete forwards the whole
  // option to onSelect's second arg, which is how handleTemplateSelect
  // recovers the unambiguous template even when titles collide.
  const templateOptions = templates.map(template => ({
    value: template.title,
    templateId: template.id,
    label: (
      <div>
        <div style={{ fontWeight: 500 }}>{template.title}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          {template.description && template.description.length > 60
            ? template.description.substring(0, 60) + '...'
            : template.description || ''}
        </div>
      </div>
    ),
  }));

  return (
    <>
      {/* Record Type Select */}
      {!hideRecordType && (
        <Form.Item
          name="recordType"
          label={t('medical:fields.recordType')}
          rules={[{ required: true, message: t('forms:validation.required') }]}
        >
          <Select onChange={handleRecordTypeChange} disabled={disabled} data-testid="medical-record-type-select">
            <Option value="note">{t('medical:recordTypes.note')}</Option>
            <Option value="procedure">{t('medical:recordTypes.procedure')}</Option>
            <Option value="test_result">{t('medical:recordTypes.testResult')}</Option>
          </Select>
        </Form.Item>
      )}

      {/* Title/Name with Template AutoComplete */}
      <Form.Item
        name="name"
        label={getFieldLabel()}
        rules={[
          { required: true, message: t('forms:validation.required') },
          { max: 200, message: t('forms:validation.maxLength', { max: 200 }) },
        ]}
      >
        <AutoComplete
          options={templateOptions}
          onSearch={onTemplateSearch}
          onSelect={handleTemplateSelect}
          placeholder={getFieldPlaceholder()}
          filterOption={false}
          disabled={disabled}
          notFoundContent={
            isSearchingTemplates ? (
              <Spin size="small" />
            ) : onTemplateSearch ? (
              t('medical:autocomplete.typeToSearch', 'Type at least 2 characters to search')
            ) : null
          }
          aria-label={getFieldLabel()}
          data-testid="medical-record-name-input"
        />
      </Form.Item>

      {/* Description TextArea */}
      <Form.Item
        name="description"
        label={t('medical:fields.description')}
        rules={[{ required: true, message: t('forms:validation.required') }]}
      >
        <TextArea
          rows={6}
          placeholder={t('medical:placeholders.description')}
          showCount
          maxLength={5000}
          disabled={disabled}
          data-testid="medical-record-description-input"
        />
      </Form.Item>

      {/* Price is now handled via Line Items tab */}
    </>
  );
};

export default MedicalRecordFieldGroup;
