/**
 * LineItemsFieldGroup - Line items management for medical records
 *
 * Provides UI for:
 * - Adding line items from saved templates
 * - Adding custom one-off items
 * - Editing prices and quantities
 * - Applying discounts
 * - Viewing/editing totals
 */

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  Table,
  InputNumber,
  Button,
  Space,
  Typography,
  Modal,
  Form,
  Input,
  Divider,
  Empty,
  Card,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { useLineItemTemplates } from '../../../hooks/useLineItemTemplates';
import { useCurrencies } from '../../../hooks/useCurrencies';
import { useAppSettings } from '../../../hooks/useAppSettings';
import type { LineItemTemplate, MedicalRecordLineItem, CreateLineItemInput } from '../../../types/lineItem';
import type { Currency } from '../../../types/medical';
import styles from '../Forms.module.css';

const { Text, Title } = Typography;
const { TextArea } = Input;

export interface LineItemsFieldGroupProps {
  /** Current line items */
  lineItems: MedicalRecordLineItem[];
  /** Callback when line items change */
  onLineItemsChange: (items: MedicalRecordLineItem[]) => void;
  /** Current discount percentage */
  discountPercent?: number;
  /** Callback when discount changes */
  onDiscountChange?: (percent: number | undefined) => void;
  /** Manual total override (when no line items) */
  manualTotal?: number;
  /** Callback when manual total changes */
  onManualTotalChange?: (total: number | undefined) => void;
  /** Whether the form is disabled */
  disabled?: boolean;
  /** Default currency ID from settings */
  defaultCurrencyId?: number;
}

export const LineItemsFieldGroup: React.FC<LineItemsFieldGroupProps> = ({
  lineItems,
  onLineItemsChange,
  discountPercent,
  onDiscountChange,
  manualTotal,
  onManualTotalChange,
  disabled = false,
  defaultCurrencyId,
}) => {
  const { t } = useTranslation(['medical', 'common', 'forms', 'settings']);
  const [customItemModalVisible, setCustomItemModalVisible] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [selectKey, setSelectKey] = useState(0); // Key to force re-render and clear selection
  const [customForm] = Form.useForm();

  // Fetch templates and currencies
  const { data: templates = [], isLoading: templatesLoading } = useLineItemTemplates(true);
  const { data: currencies = [] } = useCurrencies();
  const { settings } = useAppSettings();

  const effectiveDefaultCurrencyId = defaultCurrencyId || settings?.currencyId;

  // Get currency by ID
  const getCurrency = (currencyId: number): Currency | undefined => {
    return currencies.find(c => c.id === currencyId);
  };

  // Format price with currency symbol
  const formatPrice = (price: number, currencyId: number): string => {
    const currency = getCurrency(currencyId);
    if (currency?.symbol) {
      return `${currency.symbol}${price.toFixed(2)}`;
    }
    return price.toFixed(2);
  };

  // Calculate subtotal (before discount)
  const subtotal = useMemo(() => {
    return lineItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
  }, [lineItems]);

  // Calculate total (after discount)
  const calculatedTotal = useMemo(() => {
    if (lineItems.length === 0) return manualTotal || 0;
    const discountMultiplier = discountPercent ? (1 - discountPercent / 100) : 1;
    return subtotal * discountMultiplier;
  }, [subtotal, discountPercent, lineItems.length, manualTotal]);

  // Handle adding from template
  const handleTemplateSelect = (templateId: number | string) => {
    // Convert to number in case it comes as string
    const numericId = typeof templateId === 'string' ? parseInt(templateId, 10) : templateId;
    const template = templates.find(t => t.id === numericId);

    if (!template) {
      setSelectKey(k => k + 1); // Reset select
      return;
    }

    const newItem: MedicalRecordLineItem = {
      templateId: template.id,
      name: template.name,
      description: template.description,
      unitPrice: template.defaultPrice,
      currencyId: template.currencyId,
      quantity: 1,
    };

    const newLineItems = [...lineItems, newItem];
    onLineItemsChange(newLineItems);

    // Increment key to force Select to re-render and clear
    setSelectKey(k => k + 1);
  };

  // Handle adding custom item
  const handleAddCustomItem = () => {
    setEditingItemIndex(null);
    customForm.resetFields();
    customForm.setFieldsValue({
      quantity: 1,
      unitPrice: 0,
      currencyId: effectiveDefaultCurrencyId || currencies[0]?.id,
    });
    setCustomItemModalVisible(true);
  };

  // Handle editing existing item
  const handleEditItem = (index: number) => {
    const item = lineItems[index];
    setEditingItemIndex(index);
    customForm.setFieldsValue({
      name: item.name,
      description: item.description,
      unitPrice: item.unitPrice,
      currencyId: item.currencyId,
      quantity: item.quantity,
    });
    setCustomItemModalVisible(true);
  };

  // Handle custom item form submit
  const handleCustomFormSubmit = (values: any) => {
    const newItem: MedicalRecordLineItem = {
      templateId: editingItemIndex !== null ? lineItems[editingItemIndex].templateId : undefined,
      name: values.name,
      description: values.description || undefined,
      unitPrice: values.unitPrice,
      currencyId: values.currencyId,
      quantity: values.quantity || 1,
    };

    if (editingItemIndex !== null) {
      // Update existing item
      const updated = [...lineItems];
      updated[editingItemIndex] = { ...updated[editingItemIndex], ...newItem };
      onLineItemsChange(updated);
    } else {
      // Add new custom item
      onLineItemsChange([...lineItems, newItem]);
    }

    setCustomItemModalVisible(false);
    customForm.resetFields();
    setEditingItemIndex(null);
  };

  // Handle removing item
  const handleRemoveItem = (index: number) => {
    const updated = lineItems.filter((_, i) => i !== index);
    onLineItemsChange(updated);
  };

  // Handle inline quantity change
  const handleQuantityChange = (index: number, quantity: number | null) => {
    if (quantity === null || quantity < 1) return;
    const updated = [...lineItems];
    updated[index] = { ...updated[index], quantity };
    onLineItemsChange(updated);
  };

  // Handle inline price change
  const handlePriceChange = (index: number, unitPrice: number | null) => {
    if (unitPrice === null || unitPrice < 0) return;
    const updated = [...lineItems];
    updated[index] = { ...updated[index], unitPrice };
    onLineItemsChange(updated);
  };

  // Table columns
  const columns = [
    {
      title: t('medical:lineItems.name', 'Item'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: MedicalRecordLineItem) => (
        <div>
          <Text strong>{name}</Text>
          {record.description && (
            <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
              {record.description}
            </Text>
          )}
          {record.templateId && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {t('medical:lineItems.fromTemplate', '(from template)')}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: t('medical:lineItems.unitPrice', 'Unit Price'),
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 140,
      render: (price: number, record: MedicalRecordLineItem, index: number) => (
        <InputNumber
          value={price}
          onChange={(val) => handlePriceChange(index, val)}
          min={0}
          step={0.01}
          precision={2}
          disabled={disabled}
          formatter={(value) => {
            const currency = getCurrency(record.currencyId);
            return currency?.symbol ? `${currency.symbol} ${value}` : `${value}`;
          }}
          parser={(value) => {
            const currency = getCurrency(record.currencyId);
            const prefix = currency?.symbol ? `${currency.symbol} ` : '';
            return parseFloat((value || '0').replace(prefix, '')) || 0;
          }}
          style={{ width: 120 }}
        />
      ),
    },
    {
      title: t('medical:lineItems.quantity', 'Qty'),
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
      render: (qty: number, _: MedicalRecordLineItem, index: number) => (
        <InputNumber
          value={qty}
          onChange={(val) => handleQuantityChange(index, val)}
          min={1}
          max={999}
          disabled={disabled}
          style={{ width: 60 }}
        />
      ),
    },
    {
      title: t('medical:lineItems.subtotal', 'Subtotal'),
      key: 'subtotal',
      width: 120,
      render: (_: any, record: MedicalRecordLineItem) => (
        <Text strong>
          {formatPrice(record.unitPrice * record.quantity, record.currencyId)}
        </Text>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_: any, __: MedicalRecordLineItem, index: number) => (
        <Space>
          <Tooltip title={t('common:edit', 'Edit')}>
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEditItem(index)}
              disabled={disabled}
            />
          </Tooltip>
          <Tooltip title={t('common:delete', 'Delete')}>
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleRemoveItem(index)}
              disabled={disabled}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  // Get primary currency for display
  const primaryCurrency = lineItems.length > 0
    ? getCurrency(lineItems[0].currencyId)
    : getCurrency(effectiveDefaultCurrencyId || currencies[0]?.id);

  return (
    <div className={styles.tabContent}>
      {/* Template Selector */}
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          {t('medical:lineItems.addFromTemplate', 'Add from saved templates or create custom items')}
        </Text>
        <Space wrap>
          <Select
            key={`template-select-${selectKey}`}
            placeholder={t('medical:lineItems.selectTemplate', 'Select a line item template...')}
            style={{ width: 300 }}
            loading={templatesLoading}
            disabled={disabled || templates.length === 0}
            onChange={(value) => {
              if (value !== undefined && value !== null) {
                handleTemplateSelect(value);
              }
            }}
            options={templates.map(t => ({
              value: t.id,
              label: `${t.name} - ${formatPrice(t.defaultPrice, t.currencyId)}`,
            }))}
            notFoundContent={
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={t('medical:lineItems.noTemplates', 'No templates available. Create them in Settings.')}
              />
            }
          />
          <Button
            icon={<PlusOutlined />}
            onClick={handleAddCustomItem}
            disabled={disabled}
          >
            {t('medical:lineItems.addCustom', 'Add custom item')}
          </Button>
        </Space>
      </div>

      {/* Line Items Table */}
      {lineItems.length > 0 ? (
        <>
          <Table
            dataSource={lineItems.map((item, index) => ({ ...item, key: index }))}
            columns={columns}
            pagination={false}
            size="small"
            style={{ marginBottom: 16 }}
          />

          {/* Totals Section */}
          <Card size="small" style={{ maxWidth: 400, marginLeft: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text>{t('medical:lineItems.subtotal', 'Subtotal')}:</Text>
              <Text>{formatPrice(subtotal, lineItems[0]?.currencyId || effectiveDefaultCurrencyId || 1)}</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text>{t('medical:lineItems.discountPercent', 'Discount %')}:</Text>
              <InputNumber
                value={discountPercent || 0}
                onChange={(val) => onDiscountChange?.(val || undefined)}
                min={0}
                max={100}
                step={1}
                precision={1}
                disabled={disabled}
                formatter={(value) => `${value}%`}
                parser={(value) => parseFloat((value || '0').replace('%', '')) || 0}
                style={{ width: 100 }}
              />
            </div>
            <Divider style={{ margin: '8px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Title level={5} style={{ margin: 0 }}>{t('medical:lineItems.total', 'Total')}:</Title>
              <Title level={5} style={{ margin: 0 }}>
                {formatPrice(calculatedTotal, lineItems[0]?.currencyId || effectiveDefaultCurrencyId || 1)}
              </Title>
            </div>
          </Card>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('medical:lineItems.noItems', 'No line items added')}
          />
          {/* Manual total when no line items */}
          <div style={{ marginTop: 24, maxWidth: 300, margin: '24px auto 0' }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
              {t('medical:lineItems.manualTotalHint', 'Or enter a total amount directly:')}
            </Text>
            <InputNumber
              value={manualTotal}
              onChange={(val) => onManualTotalChange?.(val || undefined)}
              min={0}
              step={0.01}
              precision={2}
              disabled={disabled}
              placeholder={t('medical:lineItems.manualTotal', 'Manual Total')}
              formatter={(value) => {
                if (!value) return '';
                return primaryCurrency?.symbol ? `${primaryCurrency.symbol} ${value}` : `${value}`;
              }}
              parser={(value) => {
                const prefix = primaryCurrency?.symbol ? `${primaryCurrency.symbol} ` : '';
                return parseFloat((value || '0').replace(prefix, '')) || 0;
              }}
              style={{ width: '100%' }}
            />
          </div>
        </div>
      )}

      {/* Custom Item Modal */}
      <Modal
        title={editingItemIndex !== null
          ? t('medical:lineItems.editItem', 'Edit Line Item')
          : t('medical:lineItems.customItem', 'Custom Line Item')
        }
        open={customItemModalVisible}
        onCancel={() => {
          setCustomItemModalVisible(false);
          customForm.resetFields();
          setEditingItemIndex(null);
        }}
        onOk={() => customForm.submit()}
      >
        <Form
          form={customForm}
          layout="vertical"
          onFinish={handleCustomFormSubmit}
        >
          <Form.Item
            name="name"
            label={t('medical:lineItems.name', 'Item Name')}
            rules={[{ required: true, message: t('forms:validation.required', 'This field is required') }]}
          >
            <Input placeholder={t('medical:lineItems.namePlaceholder', 'e.g., Emergency consultation')} />
          </Form.Item>

          <Form.Item
            name="description"
            label={t('medical:lineItems.description', 'Description')}
          >
            <TextArea
              rows={2}
              placeholder={t('medical:lineItems.descriptionPlaceholder', 'Optional description')}
            />
          </Form.Item>

          <Space style={{ width: '100%' }} size="middle">
            <Form.Item
              name="unitPrice"
              label={t('medical:lineItems.unitPrice', 'Unit Price')}
              rules={[{ required: true, message: t('forms:validation.required', 'This field is required') }]}
              style={{ flex: 1 }}
            >
              <InputNumber
                min={0}
                step={0.01}
                precision={2}
                placeholder="0.00"
                style={{ width: '100%' }}
              />
            </Form.Item>

            <Form.Item
              name="currencyId"
              label={t('settings:lineItems.currency', 'Currency')}
              rules={[{ required: true, message: t('forms:validation.required', 'This field is required') }]}
              style={{ flex: 1 }}
            >
              <Select
                options={currencies.map(c => ({
                  value: c.id,
                  label: `${c.symbol || ''} ${c.code}`.trim(),
                }))}
              />
            </Form.Item>

            <Form.Item
              name="quantity"
              label={t('medical:lineItems.quantity', 'Quantity')}
              rules={[{ required: true, message: t('forms:validation.required', 'This field is required') }]}
              style={{ width: 100 }}
            >
              <InputNumber min={1} max={999} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
};

export default LineItemsFieldGroup;
