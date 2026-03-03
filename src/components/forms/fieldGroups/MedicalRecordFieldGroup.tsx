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
  InputNumber,
  Space,
  AutoComplete,
  Spin,
} from 'antd';
import type { FormInstance } from 'antd';
import type { RecordType, Currency, RecordTemplate } from '@/types/medical';
import styles from '../Forms.module.css';

const { TextArea } = Input;
const { Option } = Select;

// Re-export types for consumers
export type { RecordType, Currency, RecordTemplate };

export interface MedicalRecordFieldGroupProps {
  form: FormInstance;
  recordType: RecordType;
  onRecordTypeChange: (type: RecordType) => void;
  currencies: Currency[];
  templates?: RecordTemplate[];
  isSearchingTemplates?: boolean;
  onTemplateSearch?: (term: string) => void;
  onTemplateSelect?: (template: RecordTemplate) => void;
  disabled?: boolean;
  /** Hide record type select - useful for edit mode */
  hideRecordType?: boolean;
  /** Custom class names */
  fullWidthClassName?: string;
  dateInputClassName?: string;
  currencyInputClassName?: string;
  /** Title field label override */
  titleLabel?: string;
  /** Title field placeholder override */
  titlePlaceholder?: string;
  /** Minimum characters before template search triggers */
  searchMinLength?: number;
}

export const MedicalRecordFieldGroup: React.FC<MedicalRecordFieldGroupProps> = ({
  form,
  recordType,
  onRecordTypeChange,
  currencies,
  templates = [],
  isSearchingTemplates = false,
  onTemplateSearch,
  onTemplateSelect,
  disabled = false,
  hideRecordType = false,
  fullWidthClassName = styles.fullWidth,
  dateInputClassName = styles.dateInput,
  currencyInputClassName = styles.severityInput,
  titleLabel,
  titlePlaceholder,
  searchMinLength = 2,
}) => {
  const { t } = useTranslation(['medical', 'common', 'forms']);

  // Handle record type change
  const handleRecordTypeChange = (value: RecordType) => {
    onRecordTypeChange(value);
    if (value === 'note' || value === 'test_result') {
      form.setFieldValue('procedureName', undefined);
      form.setFieldValue('price', undefined);
      form.setFieldValue('currencyId', undefined);
    }
  };

  // Handle template selection from autocomplete
  const handleTemplateSelect = (value: string) => {
    const template = templates.find(t => t.title === value);
    if (template) {
      form.setFieldsValue({
        name: template.title,
        description: template.description,
        price: template.price,
        currencyId: template.currencyId,
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

  // Build autocomplete options from templates
  const templateOptions = templates.map(template => ({
    value: template.title,
    label: (
      <div>
        <div style={{ fontWeight: 500 }}>{template.title}</div>
        <div style={{ fontSize: '12px', color: '#888' }}>
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
          <Select onChange={handleRecordTypeChange} disabled={disabled}>
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
              t('medical:autocomplete.typeToSearch') || 'Type at least 2 characters to search'
            ) : null
          }
          aria-label={getFieldLabel()}
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
        />
      </Form.Item>

      {/* Price & Currency - Only for procedures */}
      {recordType === 'procedure' && (
        <Space size="middle" className={fullWidthClassName}>
          <Form.Item
            name="price"
            label={t('medical:fields.price')}
            className={dateInputClassName}
          >
            <InputNumber
              min={0}
              precision={2}
              placeholder="0.00"
              className={fullWidthClassName}
              disabled={disabled}
            />
          </Form.Item>

          <Form.Item
            name="currencyId"
            label={t('medical:fields.currency')}
            className={currencyInputClassName}
          >
            <Select
              placeholder={t('common:selectPlaceholder')}
              allowClear
              disabled={disabled}
            >
              {currencies.map(currency => (
                <Option key={currency.id} value={currency.id}>
                  {currency.symbol || ''} {currency.code}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Space>
      )}
    </>
  );
};

export default MedicalRecordFieldGroup;
