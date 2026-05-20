/**
 * TabbedMedicalRecordFields - Tabbed container for medical record forms
 *
 * Provides a consistent tabbed interface for both MedicalRecordForm and DeviceImportModal
 * with tabs for:
 * - Standard medical record fields
 * - Pharmacies/Prescriptions
 * - Line Items
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, Form, Input, Typography, Badge } from 'antd';
import type { FormInstance } from 'antd';
import {
  FileTextOutlined,
  MedicineBoxOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { MedicalRecordFieldGroup } from './MedicalRecordFieldGroup';
import type { MedicalRecordFieldGroupProps } from './MedicalRecordFieldGroup';
import { LineItemsFieldGroup } from './LineItemsFieldGroup';
import type { MedicalRecordLineItem } from '../../../types/lineItem';
import styles from '../Forms.module.css';

const { TextArea } = Input;
const { Text } = Typography;

export interface TabbedMedicalRecordFieldsProps extends MedicalRecordFieldGroupProps {
  /** Initial active tab key */
  defaultActiveTab?: string;
  /** Callback when tab changes */
  onTabChange?: (activeKey: string) => void;
  /** Initial prescription notes value */
  prescriptionNotesValue?: string;
  /** Whether to show prescription notes indicator badge */
  showPrescriptionBadge?: boolean;
  /** Whether to show line items indicator badge */
  showLineItemsBadge?: boolean;
  /** Number of line items (for badge) */
  lineItemsCount?: number;
  /** Current line items */
  lineItems?: MedicalRecordLineItem[];
  /** Callback when line items change */
  onLineItemsChange?: (items: MedicalRecordLineItem[]) => void;
  /** Current discount percentage */
  discountPercent?: number;
  /** Callback when discount changes */
  onDiscountChange?: (percent: number | undefined) => void;
  /** Manual total override (when no line items) */
  manualTotal?: number;
  /** Callback when manual total changes */
  onManualTotalChange?: (total: number | undefined) => void;
}

export const TabbedMedicalRecordFields: React.FC<TabbedMedicalRecordFieldsProps> = ({
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
  defaultActiveTab = 'standard',
  onTabChange,
  prescriptionNotesValue,
  showPrescriptionBadge = false,
  showLineItemsBadge = false,
  lineItemsCount = 0,
  lineItems = [],
  onLineItemsChange,
  discountPercent,
  onDiscountChange,
  manualTotal,
  onManualTotalChange,
}) => {
  const { t } = useTranslation(['medical', 'common', 'forms']);
  const [activeTab, setActiveTab] = useState(defaultActiveTab);

  // Watch prescription notes to show badge indicator
  const prescriptionNotes = Form.useWatch('prescriptionNotes', form);
  const hasPrescriptionContent = prescriptionNotes && prescriptionNotes.trim().length > 0;

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    onTabChange?.(key);
  };

  const tabItems = [
    {
      key: 'standard',
      label: (
        <span>
          <FileTextOutlined />
          {t('medical:tabs.standard', 'Standard')}
        </span>
      ),
      children: (
        <MedicalRecordFieldGroup
          form={form}
          recordType={recordType}
          onRecordTypeChange={onRecordTypeChange}
          templates={templates}
          isSearchingTemplates={isSearchingTemplates}
          onTemplateSearch={onTemplateSearch}
          onTemplateSelect={onTemplateSelect}
          disabled={disabled}
          hideRecordType={hideRecordType}
          titleLabel={titleLabel}
          titlePlaceholder={titlePlaceholder}
        />
      ),
    },
    {
      key: 'prescriptions',
      label: (
        <Badge dot={showPrescriptionBadge || hasPrescriptionContent} offset={[6, 0]}>
          <span>
            <MedicineBoxOutlined />
            {t('medical:tabs.prescriptions', 'Prescriptions')}
          </span>
        </Badge>
      ),
      children: (
        <div className={styles.tabContent}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            {t('medical:prescriptions.description', 'Enter prescription or pharmacy notes. This will be included in the generated PDF report for the customer.')}
          </Text>
          <Form.Item
            name="prescriptionNotes"
            label={t('medical:fields.prescriptionNotes', 'Prescription Notes')}
          >
            <TextArea
              rows={8}
              placeholder={t('medical:placeholders.prescriptionNotes', 'Enter medication name, dosage, frequency, duration, and any special instructions...')}
              showCount
              maxLength={5000}
              disabled={disabled}
            />
          </Form.Item>
        </div>
      ),
    },
    {
      key: 'lineItems',
      label: (
        <Badge count={showLineItemsBadge ? lineItemsCount : 0} offset={[6, 0]}>
          <span>
            <UnorderedListOutlined />
            {t('medical:tabs.lineItems', 'Line Items')}
          </span>
        </Badge>
      ),
      children: (
        <LineItemsFieldGroup
          lineItems={lineItems}
          onLineItemsChange={onLineItemsChange || (() => {})}
          discountPercent={discountPercent}
          onDiscountChange={onDiscountChange}
          manualTotal={manualTotal}
          onManualTotalChange={onManualTotalChange}
          disabled={disabled}
        />
      ),
    },
  ];

  return (
    <Tabs
      activeKey={activeTab}
      onChange={handleTabChange}
      items={tabItems}
      className={styles.tabbedFields}
    />
  );
};

export default TabbedMedicalRecordFields;
