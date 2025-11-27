import React, { useState } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, Select, InputNumber, Tag, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, FileTextOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
  useRecordTemplates,
  useCreateRecordTemplate,
  useUpdateRecordTemplate,
  useDeleteRecordTemplate,
} from '@/hooks/useRecordTemplates';
import { useCurrencies } from '@/hooks/useMedicalRecords';
import type { RecordTemplate, RecordType } from '@/types/medical';
import type { ColumnsType } from 'antd/es/table';

const { TextArea } = Input;
const { Option } = Select;

const RecordTemplatesSettings: React.FC = () => {
  const { t } = useTranslation(['settings', 'medical', 'common', 'forms']);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RecordTemplate | null>(null);
  const [form] = Form.useForm();

  const { data: templates, isLoading } = useRecordTemplates();
  const { data: currencies } = useCurrencies();
  const createMutation = useCreateRecordTemplate();
  const updateMutation = useUpdateRecordTemplate();
  const deleteMutation = useDeleteRecordTemplate();

  const handleCreate = () => {
    setEditingTemplate(null);
    form.resetFields();
    form.setFieldsValue({ recordType: 'note' });
    setIsModalOpen(true);
  };

  const handleEdit = (template: RecordTemplate) => {
    setEditingTemplate(template);
    form.setFieldsValue({
      recordType: template.recordType,
      title: template.title,
      description: template.description,
      price: template.price,
      currencyId: template.currencyId,
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (templateId: number) => {
    try {
      await deleteMutation.mutateAsync(templateId);
    } catch (error) {
      console.error('Failed to delete template:', error);
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();

      if (editingTemplate) {
        // Update existing template
        await updateMutation.mutateAsync({
          templateId: editingTemplate.id,
          input: {
            title: values.title,
            description: values.description,
            price: values.price,
            currencyId: values.currencyId,
          },
        });
      } else {
        // Create new template
        await createMutation.mutateAsync({
          recordType: values.recordType,
          title: values.title,
          description: values.description,
          price: values.price,
          currencyId: values.currencyId,
        });
      }

      setIsModalOpen(false);
      form.resetFields();
    } catch (error) {
      console.error('Form validation failed:', error);
    }
  };

  const handleModalCancel = () => {
    setIsModalOpen(false);
    form.resetFields();
    setEditingTemplate(null);
  };

  const getTypeTag = (recordType: RecordType) => {
    if (recordType === 'procedure') return { color: 'blue', label: t('medical:recordTypes.procedure') };
    if (recordType === 'test_result') return { color: 'purple', label: t('medical:recordTypes.testResult') };
    return { color: 'green', label: t('medical:recordTypes.note') };
  };

  const getCurrencyDisplay = (currencyId?: number) => {
    if (!currencyId || !currencies) return '-';
    const currency = currencies.find(c => c.id === currencyId);
    return currency ? `${currency.symbol} ${currency.code}` : '-';
  };

  const columns: ColumnsType<RecordTemplate> = [
    {
      title: t('medical:fields.recordType'),
      dataIndex: 'recordType',
      key: 'recordType',
      width: 120,
      render: (recordType: RecordType) => {
        const tag = getTypeTag(recordType);
        return <Tag color={tag.color}>{tag.label}</Tag>;
      },
      filters: [
        { text: t('medical:recordTypes.procedure'), value: 'procedure' },
        { text: t('medical:recordTypes.note'), value: 'note' },
        { text: t('medical:recordTypes.testResult'), value: 'test_result' },
      ],
      onFilter: (value, record) => record.recordType === value,
    },
    {
      title: t('medical:fields.title'),
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: t('medical:fields.description'),
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      width: 300,
    },
    {
      title: t('medical:fields.price'),
      dataIndex: 'price',
      key: 'price',
      width: 120,
      render: (price?: number, record?: RecordTemplate) => {
        if (!price) return '-';
        return `${getCurrencyDisplay(record?.currencyId)}${price.toFixed(2)}`;
      },
    },
    {
      title: t('common:actionsLabel'),
      key: 'actions',
      width: 120,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            {t('common:buttons.edit')}
          </Button>
          <Popconfirm
            title={t('common:confirmDelete')}
            description={t('settings:templates.confirmDelete')}
            onConfirm={() => handleDelete(record.id)}
            okText={t('common:buttons.delete')}
            cancelText={t('common:buttons.cancel')}
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
            >
              {t('common:buttons.delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={
        <Space>
          <FileTextOutlined />
          {t('settings:templates.title')}
        </Space>
      }
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          {t('settings:templates.createTemplate')}
        </Button>
      }
    >
      <Table
        columns={columns}
        dataSource={templates}
        rowKey="id"
        loading={isLoading}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `${total} ${t('settings:templates.totalTemplates')}`,
        }}
        scroll={{ x: 800 }}
      />

      <Modal
        title={editingTemplate ? t('settings:templates.editTemplate') : t('settings:templates.createTemplate')}
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
        okText={editingTemplate ? t('common:buttons.update') : t('common:buttons.create')}
        cancelText={t('common:buttons.cancel')}
        width={600}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ recordType: 'note' }}
        >
          <Form.Item
            name="recordType"
            label={t('medical:fields.recordType')}
            rules={[{ required: true, message: t('forms:validation.required') }]}
          >
            <Select disabled={!!editingTemplate}>
              <Option value="note">{t('medical:recordTypes.note')}</Option>
              <Option value="procedure">{t('medical:recordTypes.procedure')}</Option>
              <Option value="test_result">{t('medical:recordTypes.testResult')}</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="title"
            label={t('medical:fields.title')}
            rules={[
              { required: true, message: t('forms:validation.required') },
              { max: 200, message: t('forms:validation.maxLength', { max: 200 }) },
            ]}
          >
            <Input placeholder={t('settings:templates.titlePlaceholder')} />
          </Form.Item>

          <Form.Item
            name="description"
            label={t('medical:fields.description')}
            rules={[{ required: true, message: t('forms:validation.required') }]}
          >
            <TextArea
              rows={4}
              placeholder={t('settings:templates.descriptionPlaceholder')}
              showCount
              maxLength={5000}
            />
          </Form.Item>

          <Space style={{ width: '100%' }}>
            <Form.Item
              name="price"
              label={t('medical:fields.price')}
            >
              <InputNumber
                min={0}
                precision={2}
                placeholder="0.00"
                style={{ width: 150 }}
              />
            </Form.Item>

            <Form.Item
              name="currencyId"
              label={t('medical:fields.currency')}
            >
              <Select placeholder={t('common:selectPlaceholder')} allowClear style={{ width: 200 }}>
                {currencies?.map(currency => (
                  <Option key={currency.id} value={currency.id}>
                    {currency.symbol} {currency.code}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </Card>
  );
};

export default RecordTemplatesSettings;
