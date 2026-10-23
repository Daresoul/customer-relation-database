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
  SaveOutlined,
} from '@ant-design/icons';
import { useLineItemTemplates, useCreateLineItemTemplate } from '../../../hooks/useLineItemTemplates';
import { formatMoney } from '@/utils/money';
import { useCurrencies } from '../../../hooks/useCurrencies';
import { useAppSettings } from '../../../hooks/useAppSettings';
import type { MedicalRecordLineItem } from '../../../types/lineItem';
import type { Currency } from '../../../types/medical';
import { localeMoneyParser, localeNumberParser } from '../../../utils/localeNumber';
import { useTaxRates, useInvoiceTotals } from '../../../hooks/useClinic';
import { toMoneyLines, withRate, rateForTemplate, defaultRate } from '../../../utils/invoiceLines';
import styles from '../Forms.module.css';

const { Text, Title } = Typography;
const { TextArea } = Input;

export interface LineItemsFieldGroupProps {
  /** Current line items */
  lineItems: MedicalRecordLineItem[];
  /** Callback when line items change */
  onLineItemsChange: (items: MedicalRecordLineItem[]) => void;
  /** Current discount percentage */
  discountPercent?: number | null;
  /** Callback when discount changes; null when the field is cleared */
  onDiscountChange?: (percent: number | null) => void;
  /** Manual total override (when no line items) */
  manualTotal?: number | null;
  /** Callback when manual total changes; null when the field is cleared */
  onManualTotalChange?: (total: number | null) => void;
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

  // Mutation used by the "Save as template & add" button — promotes a
  // custom one-off item into a reusable template in Settings → Factura.
  // The hook already invalidates the templates query on success and
  // surfaces a success/error notification, so callers just need to
  // await mutateAsync and react to thrown errors (keep modal open on
  // failure so the user can fix the name and retry).
  const createTemplateMutation = useCreateLineItemTemplate();

  const effectiveDefaultCurrencyId = defaultCurrencyId || settings?.currencyId;

  // Get currency by ID
  const getCurrency = (currencyId: number): Currency | undefined => {
    return currencies.find(c => c.id === currencyId);
  };

  const formatPrice = (price: number, currencyId: number): string =>
    formatMoney(price, getCurrency(currencyId));

  // VAT rates offered for lines, and the totals as the invoice PDF will print them.
  const { data: taxRates = [] } = useTaxRates(true);
  const moneyLines = useMemo(() => toMoneyLines(lineItems), [lineItems]);
  const { data: totals } = useInvoiceTotals(moneyLines, discountPercent);

  // Active rates, plus a hidden one the line still has.
  const rateOptions = (item?: MedicalRecordLineItem) => {
    const options = taxRates.map(r => ({ value: r.id, label: r.name }));
    if (item?.taxRateId != null && !taxRates.some(r => r.id === item.taxRateId)) {
      options.push({ value: item.taxRateId, label: item.vatName ?? `${item.vatPercent ?? 0}%` });
    }
    return options;
  };

  // Handle adding from template
  const handleTemplateSelect = (templateId: number | string) => {
    // Convert to number in case it comes as string
    const numericId = typeof templateId === 'string' ? parseInt(templateId, 10) : templateId;
    const template = templates.find(t => t.id === numericId);

    if (!template) {
      setSelectKey(k => k + 1); // Reset select
      return;
    }

    // Picking an item already on the invoice counts it once more.
    const existing = lineItems.findIndex(item => item.templateId === template.id);
    if (existing >= 0) {
      onLineItemsChange(lineItems.map((item, i) =>
        i === existing ? { ...item, quantity: (item.quantity || 0) + 1 } : item,
      ));
      setSelectKey(k => k + 1);
      return;
    }

    const newItem: MedicalRecordLineItem = withRate({
      templateId: template.id,
      name: template.name,
      description: template.description,
      unitPrice: template.defaultPrice,
      currencyId: template.currencyId,
      quantity: 1,
    }, rateForTemplate(template, taxRates));

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
      taxRateId: defaultRate(taxRates)?.id,
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
      taxRateId: item.taxRateId ?? undefined,
    });
    setCustomItemModalVisible(true);
  };

  /** Add (or update, in edit mode) a line item from validated form
   *  values. Does NOT touch the templates table — that's the
   *  "Save as template & add" path's job. */
  const applyCustomFormValues = (values: any) => {
    const existing = editingItemIndex !== null ? lineItems[editingItemIndex] : undefined;
    const base: MedicalRecordLineItem = {
      templateId: existing?.templateId,
      name: values.name,
      description: values.description || undefined,
      unitPrice: values.unitPrice,
      currencyId: values.currencyId,
      quantity: values.quantity || 1,
    };
    const rateId = values.taxRateId ?? null;
    const newItem = existing && rateId !== null && rateId === existing.taxRateId
      ? { ...base, taxRateId: existing.taxRateId, vatName: existing.vatName, vatPercent: existing.vatPercent }
      : withRate(base, taxRates.find(r => r.id === rateId));

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

  /** "Add only" — add the item to this medical record, don't save
   *  as a template. AntD shows inline validation errors on reject. */
  const handleAddOnly = async () => {
    try {
      const values = await customForm.validateFields();
      applyCustomFormValues(values);
    } catch {
      // Validation errors are surfaced inline by AntD; nothing to do.
    }
  };

  /** "Save as template & add" — promote the item into a reusable
   *  Factura template in Settings first, then add to this record.
   *  If the template save fails (e.g. duplicate name), keep the modal
   *  open so the user can fix the name or fall back to "Add only". */
  const handleSaveAndAdd = async () => {
    let values: any;
    try {
      values = await customForm.validateFields();
    } catch {
      return; // validation errors shown inline
    }
    try {
      await createTemplateMutation.mutateAsync({
        name: values.name,
        description: values.description || undefined,
        defaultPrice: values.unitPrice,
        currencyId: values.currencyId,
      });
    } catch {
      // Mutation hook already surfaced an error notification via
      // createMutationErrorHandler — leave modal open.
      return;
    }
    applyCustomFormValues(values);
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

  // Handle inline VAT rate change; a cleared select removes the rate
  const handleRateChange = (index: number, rateId: number | undefined) => {
    const updated = [...lineItems];
    updated[index] = withRate(updated[index], taxRates.find(r => r.id === rateId));
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
          parser={localeMoneyParser}
          aria-label={t('medical:lineItems.unitPrice', 'Unit Price')}
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
          precision={0}
          parser={localeNumberParser}
          aria-label={t('medical:lineItems.quantity', 'Qty')}
          disabled={disabled}
          style={{ width: 60 }}
        />
      ),
    },
    {
      title: t('medical:lineItems.vat'),
      key: 'vat',
      width: 130,
      render: (_: unknown, record: MedicalRecordLineItem, index: number) => (
        <Select
          size="small"
          allowClear
          value={record.taxRateId ?? undefined}
          placeholder={t('medical:lineItems.noVat')}
          options={rateOptions(record)}
          onChange={(value) => handleRateChange(index, value)}
          disabled={disabled}
          aria-label={t('medical:lineItems.vat')}
          style={{ width: 120 }}
        />
      ),
    },
    {
      title: t('medical:lineItems.subtotal', 'Subtotal'),
      key: 'subtotal',
      width: 120,
      render: (_: any, record: MedicalRecordLineItem, index: number) => (
        <Text strong>
          {formatPrice(totals?.lineAmounts[index] ?? record.unitPrice * record.quantity, record.currencyId)}
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

  /** A total from the backend; a dash until it has arrived. */
  const money = (amount: number | undefined) =>
    amount === undefined ? '—' : formatPrice(amount, lineItems[0]?.currencyId || effectiveDefaultCurrencyId || 1);

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
            showSearch
            optionFilterProp="label"
            filterOption={(input, option) =>
              String(option?.label ?? '').toLowerCase().includes(input.trim().toLowerCase())
            }
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
          <Card size="small" style={{ maxWidth: 400, marginLeft: 'auto' }} data-testid="line-items-totals">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text>{t('medical:lineItems.subtotal', 'Subtotal')}:</Text>
              <Text>{money(totals?.subtotal)}</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text>{t('medical:lineItems.discountPercent', 'Discount %')}:</Text>
              <InputNumber
                value={discountPercent ?? null}
                onChange={(val) => onDiscountChange?.(val ?? null)}
                min={0}
                max={100}
                step={1}
                precision={1}
                disabled={disabled}
                formatter={(value) => (value === undefined || String(value) === '' ? '' : `${value}%`)}
                parser={localeNumberParser}
                aria-label={t('medical:lineItems.discountPercent', 'Discount %')}
                style={{ width: 100 }}
              />
            </div>
            {totals && totals.discountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text>{t('medical:lineItems.discount')}:</Text>
                <Text type="danger">{money(-totals.discountAmount)}</Text>
              </div>
            )}
            {totals && totals.vatGroups.length > 0 && (
              <>
                <Divider style={{ margin: '8px 0' }} />
                {totals.vatGroups.map(group => (
                  <div
                    key={group.label}
                    data-testid={`vat-group-${group.label}`}
                    style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}
                  >
                    <Text type="secondary">{group.label}</Text>
                    <Text type="secondary">
                      {t('medical:lineItems.vatBase')} {money(group.net)} · {t('medical:lineItems.vatAmount')} {money(group.vat)}
                    </Text>
                  </div>
                ))}
                {!totals.pricesIncludeVat && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text>{t('medical:lineItems.vatAdded')}:</Text>
                    <Text>{money(totals.vatTotal)}</Text>
                  </div>
                )}
              </>
            )}
            <Divider style={{ margin: '8px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Title level={5} style={{ margin: 0 }}>{t('medical:lineItems.total', 'Total')}:</Title>
              <Title level={5} style={{ margin: 0 }}>
                {money(totals?.total)}
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
              value={manualTotal ?? null}
              onChange={(val) => onManualTotalChange?.(val ?? null)}
              min={0}
              step={0.01}
              precision={2}
              disabled={disabled}
              placeholder={t('medical:lineItems.manualTotal', 'Manual Total')}
              formatter={(value) => {
                if (!value) return '';
                return primaryCurrency?.symbol ? `${primaryCurrency.symbol} ${value}` : `${value}`;
              }}
              parser={localeMoneyParser}
              aria-label={t('medical:lineItems.manualTotal', 'Manual Total')}
              style={{ width: '100%' }}
            />
          </div>
        </div>
      )}

      {/* Custom Item Modal.
          Two action buttons when adding a NEW custom item:
            - "Add only"           → one-off, lives only on this record
            - "Save & add"         → also persisted as a template in
                                     Settings → Factura for reuse
          In edit mode (editingItemIndex !== null) we collapse this to
          a single "Save" button — editing an existing line item on
          this record has no template-save semantics. */}
      <Modal
        title={editingItemIndex !== null
          ? t('medical:lineItems.editItem', 'Edit Line Item')
          : t('medical:lineItems.customItem', 'Custom Line Item')
        }
        open={customItemModalVisible}
        onCancel={() => {
          if (createTemplateMutation.isPending) return;
          setCustomItemModalVisible(false);
          customForm.resetFields();
          setEditingItemIndex(null);
        }}
        footer={
          editingItemIndex !== null ? (
            <Space>
              <Button
                onClick={() => {
                  setCustomItemModalVisible(false);
                  customForm.resetFields();
                  setEditingItemIndex(null);
                }}
              >
                {t('common:cancel')}
              </Button>
              <Button type="primary" onClick={handleAddOnly}>
                {t('common:save', 'Save')}
              </Button>
            </Space>
          ) : (
            <Space wrap>
              <Button
                onClick={() => {
                  setCustomItemModalVisible(false);
                  customForm.resetFields();
                }}
                disabled={createTemplateMutation.isPending}
              >
                {t('common:cancel')}
              </Button>
              <Button
                onClick={handleSaveAndAdd}
                loading={createTemplateMutation.isPending}
                icon={<SaveOutlined />}
              >
                {t('medical:lineItems.saveAsTemplateAndAdd', 'Save as template & add')}
              </Button>
              <Button
                type="primary"
                onClick={handleAddOnly}
                disabled={createTemplateMutation.isPending}
              >
                {t('medical:lineItems.addOnly', 'Add only')}
              </Button>
            </Space>
          )
        }
      >
        <Form
          form={customForm}
          layout="vertical"
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
                parser={localeMoneyParser}
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
              <InputNumber min={1} max={999} precision={0} parser={localeNumberParser} style={{ width: '100%' }} />
            </Form.Item>
          </Space>

          <Form.Item name="taxRateId" label={t('medical:lineItems.vat')}>
            <Select
              allowClear
              placeholder={t('medical:lineItems.noVat')}
              options={rateOptions(editingItemIndex !== null ? lineItems[editingItemIndex] : undefined)}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default LineItemsFieldGroup;
