import React, { useState } from 'react';
import { Card, Form, Input, Button, Table, Space, Modal, Popconfirm, InputNumber, Select } from 'antd';
import { DollarOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../../utils/themeStyles';
import styles from '../Settings.module.css';
import {
  useLineItemTemplates,
  useCreateLineItemTemplate,
  useUpdateLineItemTemplate,
  useDeleteLineItemTemplate
} from '../../../hooks/useLineItemTemplates';
import { useCurrencies } from '../../../hooks/useCurrencies';
import { useAppSettings } from '../../../hooks/useAppSettings';
import { LineItemTemplate, CreateLineItemTemplateInput, UpdateLineItemTemplateInput } from '../../../types/lineItem';
import { Currency } from '../../../types/medical';

const { TextArea } = Input;

interface LineItemsSettingsProps {
  isUpdating: boolean;
}

const LineItemsSettings: React.FC<LineItemsSettingsProps> = ({ isUpdating }) => {
  const { t } = useTranslation(['common', 'forms', 'settings']);
  const themeColors = useThemeColors();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<LineItemTemplate | null>(null);
  const [form] = Form.useForm();

  // Fetch line item templates (show both active and inactive for settings management)
  const { data: templates = [], isLoading, refetch } = useLineItemTemplates(false);
  const { data: currencies = [] } = useCurrencies();
  const { settings } = useAppSettings();

  const createMutation = useCreateLineItemTemplate();
  const updateMutation = useUpdateLineItemTemplate();
  const deleteMutation = useDeleteLineItemTemplate();

  // Get currency by ID helper
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

  const handleAdd = () => {
    setEditingItem(null);
    form.resetFields();
    // Set default values for new item - use user's default currency
    form.setFieldsValue({
      defaultPrice: 0,
      currencyId: settings?.currencyId || currencies[0]?.id,
    });
    setModalVisible(true);
  };

  const handleEdit = (item: LineItemTemplate) => {
    setEditingItem(item);
    form.setFieldsValue({
      name: item.name,
      description: item.description,
      defaultPrice: item.defaultPrice,
      currencyId: item.currencyId,
    });
    setModalVisible(true);
  };

  const handleDeactivate = async (id: number) => {
    try {
      await deleteMutation.mutateAsync(id);
      refetch();
    } catch (error) {
      console.error('Deactivate line item error:', error);
    }
  };

  const handleReactivate = async (item: LineItemTemplate) => {
    try {
      await updateMutation.mutateAsync({
        id: item.id,
        data: { isActive: true },
      });
      refetch();
    } catch (error) {
      console.error('Reactivate line item error:', error);
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      const itemData = {
        name: values.name,
        description: values.description || undefined,
        defaultPrice: values.defaultPrice,
        currencyId: values.currencyId,
      };

      if (editingItem) {
        await updateMutation.mutateAsync({
          id: editingItem.id,
          data: itemData as UpdateLineItemTemplateInput,
        });
      } else {
        await createMutation.mutateAsync(itemData as CreateLineItemTemplateInput);
      }

      setModalVisible(false);
      form.resetFields();
      setEditingItem(null);
      refetch();
    } catch (error) {
      console.error('Save line item error:', error);
    }
  };

  const columns = [
    {
      title: t('settings:lineItems.name', 'Name'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: LineItemTemplate) => (
        <span className={record.isActive ? styles.roomNameActive : styles.roomNameInactive}>
          {text}
          {!record.isActive && ` (${t('common:inactive', 'Inactive')})`}
        </span>
      ),
    },
    {
      title: t('settings:lineItems.price', 'Default Price'),
      dataIndex: 'defaultPrice',
      key: 'defaultPrice',
      width: 150,
      render: (price: number, record: LineItemTemplate) => formatPrice(price, record.currencyId),
    },
    {
      title: t('settings:lineItems.description', 'Description'),
      dataIndex: 'description',
      key: 'description',
      render: (text: string) => text || '-',
    },
    {
      title: t('common:actions', 'Actions'),
      key: 'actions',
      width: 200,
      render: (_: any, record: LineItemTemplate) => (
        <Space>
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => handleEdit(record)}
          >
            {t('common:edit', 'Edit')}
          </Button>
          {record.isActive ? (
            <Popconfirm
              title={t('settings:lineItems.confirmDelete', 'Are you sure you want to deactivate this line item?')}
              onConfirm={() => handleDeactivate(record.id)}
              okText={t('common:yes', 'Yes')}
              cancelText={t('common:no', 'No')}
            >
              <Button
                icon={<DeleteOutlined />}
                size="small"
                danger
                loading={deleteMutation.isPending}
              >
                {t('common:deactivate', 'Deactivate')}
              </Button>
            </Popconfirm>
          ) : (
            <Button
              size="small"
              onClick={() => handleReactivate(record)}
              loading={updateMutation.isPending}
            >
              {t('common:reactivate', 'Reactivate')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card
        title={
          <span className={styles.cardTitle}>
            <DollarOutlined /> {t('settings:lineItems.title', 'Line Items')}
          </span>
        }
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
          >
            {t('settings:lineItems.addButton', 'Add Line Item')}
          </Button>
        }
        className={styles.roomsCard}
      >
        <p className={styles.cardDescription}>
          {t('settings:lineItems.description', 'Manage reusable line item templates for medical records')}
        </p>
        <Table
          columns={columns}
          dataSource={templates}
          rowKey="id"
          pagination={false}
          size="middle"
          loading={isLoading}
        />
      </Card>

      {/* Add/Edit Line Item Modal */}
      <Modal
        title={editingItem
          ? t('settings:lineItems.editTitle', 'Edit Line Item')
          : t('settings:lineItems.createTitle', 'Create Line Item')
        }
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
          setEditingItem(null);
        }}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          key={editingItem?.id || 'new'}
        >
          <Form.Item
            name="name"
            label={t('settings:lineItems.name', 'Name')}
            rules={[{ required: true, message: t('forms:validation.required', 'This field is required') }]}
          >
            <Input placeholder={t('settings:lineItems.namePlaceholder', 'e.g., Consultation, X-Ray, Blood Test')} />
          </Form.Item>

          <Form.Item
            name="description"
            label={t('settings:lineItems.descriptionLabel', 'Description')}
          >
            <TextArea
              rows={3}
              placeholder={t('settings:lineItems.descriptionPlaceholder', 'Optional description of the line item')}
            />
          </Form.Item>

          <Form.Item
            name="defaultPrice"
            label={t('settings:lineItems.price', 'Default Price')}
            rules={[{ required: true, message: t('forms:validation.required', 'This field is required') }]}
          >
            <InputNumber
              min={0}
              step={0.01}
              precision={2}
              placeholder="0.00"
              className={styles.fullWidth}
            />
          </Form.Item>

          <Form.Item
            name="currencyId"
            label={t('settings:lineItems.currency', 'Currency')}
            rules={[{ required: true, message: t('forms:validation.required', 'This field is required') }]}
          >
            <Select
              placeholder={t('settings:lineItems.selectCurrency', 'Select currency')}
              options={currencies.map(c => ({
                value: c.id,
                label: `${c.symbol || ''} ${c.code} - ${c.name}`.trim(),
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default LineItemsSettings;
