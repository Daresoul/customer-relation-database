/**
 * TabbedMedicalRecordFields - Tabbed container for medical record forms
 *
 * Provides a consistent tabbed interface for both MedicalRecordForm and DeviceImportModal
 * with tabs for:
 * - Standard medical record fields
 * - Pharmacies/Prescriptions
 * - Line Items
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, Form, Input, Typography, Badge } from 'antd';
import type { FormInstance } from 'antd';
import {
  FileTextOutlined,
  MedicineBoxOutlined,
  UnorderedListOutlined,
  ExclamationCircleFilled,
} from '@ant-design/icons';
import { MedicalRecordFieldGroup } from './MedicalRecordFieldGroup';
import type { MedicalRecordFieldGroupProps } from './MedicalRecordFieldGroup';
import { LineItemsFieldGroup } from './LineItemsFieldGroup';
import type { MedicalRecordLineItem } from '../../../types/lineItem';
import styles from '../Forms.module.css';

/**
 * Maps each form field name to the tab it lives on. Used to map
 * validateFields() error reports back to the tab that needs
 * surfacing — otherwise the user clicks Create on (say) the Line
 * Items tab, validation fails on a required Description field that
 * lives on the Standard tab, and nothing visible happens because
 * AntD's inline error is on a hidden tab.
 *
 * Keep in sync with the fields rendered by each tab below.
 */
type TabKey = 'standard' | 'prescriptions' | 'lineItems';
const FIELD_TO_TAB: Readonly<Record<string, TabKey>> = {
  recordType: 'standard',
  name: 'standard',
  description: 'standard',
  prescriptionNotes: 'prescriptions',
};

/** Order tabs are visited for "switch to the first one with errors". */
const TAB_ORDER: TabKey[] = ['standard', 'prescriptions', 'lineItems'];

/**
 * Compute which tabs currently have validation errors.
 * Exported so the parent can pre-check before deciding to call
 * onFinishFailed (rarely needed, but useful for tests).
 */
export function tabsWithErrors(errorFields: readonly string[]): Set<TabKey> {
  const result = new Set<TabKey>();
  for (const f of errorFields) {
    const tab = FIELD_TO_TAB[f];
    if (tab) result.add(tab);
  }
  return result;
}

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
  /**
   * Field names that failed validation on the most recent submit
   * attempt. When this changes from empty to non-empty, the component
   * auto-switches to the first tab containing an error and shows a
   * red dot on every tab that has at least one. Pass an empty array
   * (or omit) to clear the indicators.
   */
  errorFields?: readonly string[];
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
  errorFields,
}) => {
  const { t } = useTranslation(['medical', 'common', 'forms']);
  const [activeTab, setActiveTab] = useState(defaultActiveTab);

  // Watch prescription notes to show badge indicator
  const prescriptionNotes = Form.useWatch('prescriptionNotes', form);
  const hasPrescriptionContent = prescriptionNotes && prescriptionNotes.trim().length > 0;

  // Set of tabs that currently have validation errors. Recomputed
  // every render — cheap because the input list is short.
  const errored = tabsWithErrors(errorFields ?? []);

  // Auto-switch to the first tab containing an error whenever the
  // error set changes. If the currently-active tab is already in the
  // error set we leave it alone (don't yank the user away from the
  // field they're editing). Joining the array into a string makes the
  // dependency stable across array identity changes.
  const errorKey = (errorFields ?? []).join('|');
  useEffect(() => {
    if (!errorFields || errorFields.length === 0) return;
    if (errored.has(activeTab as TabKey)) return;
    const first = TAB_ORDER.find((t) => errored.has(t));
    if (first && first !== activeTab) {
      setActiveTab(first);
      onTabChange?.(first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorKey]);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    onTabChange?.(key);
  };

  /** Wrap a tab label so a red exclamation icon prefixes the label
   *  when that tab has any validation errors. */
  const labelWithError = (key: TabKey, label: React.ReactNode) => {
    if (!errored.has(key)) return label;
    return (
      <span style={{ color: 'var(--ant-color-error, #ff4d4f)' }}>
        <ExclamationCircleFilled style={{ marginRight: 4 }} />
        {label}
      </span>
    );
  };

  const tabItems = [
    {
      key: 'standard',
      label: labelWithError(
        'standard',
        <span>
          <FileTextOutlined />
          {t('medical:tabs.standard', 'Standard')}
        </span>,
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
      label: labelWithError(
        'prescriptions',
        // Blue dot, not the default red, so it's clearly "this tab
        // has content" — not "this tab has an error" (which is what
        // red means everywhere else in this form, via labelWithError).
        <Badge
          dot={showPrescriptionBadge || hasPrescriptionContent}
          color="blue"
          offset={[6, 0]}
        >
          <span>
            <MedicineBoxOutlined />
            {t('medical:tabs.prescriptions', 'Prescriptions')}
          </span>
        </Badge>,
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
      label: labelWithError(
        'lineItems',
        // Blue numeric badge — same "this tab has content" semantics as
        // the Prescriptions dot. Red is reserved for validation errors.
        <Badge
          count={showLineItemsBadge ? lineItemsCount : 0}
          color="blue"
          offset={[6, 0]}
        >
          <span>
            <UnorderedListOutlined />
            {t('medical:tabs.lineItems', 'Factura')}
          </span>
        </Badge>,
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
