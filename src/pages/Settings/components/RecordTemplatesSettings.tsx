import React, { useState } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, Select, Tag, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, FileTextOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
  useRecordTemplates,
  useCreateRecordTemplate,
  useUpdateRecordTemplate,
  useDeleteRecordTemplate,
} from '@/hooks/useRecordTemplates';
import type { RecordTemplate, RecordType } from '@/types/medical';
import type { ColumnsType } from 'antd/es/table';

// NOTE: Record templates used to carry a price + currency, but pricing
// has moved entirely to Factura (per-medical-record line items, each
// with its own price + currency). The Rust model still has nullable
// `price` / `currency_id` columns on `record_templates` — we leave
// them in place for backwards compatibility with existing rows, but
// the UI no longer reads or writes them. New templates are created
// with price/currency omitted (the backend stores NULL).

const { TextArea } = Input;
const { Option } = Select;

const RecordTemplatesSettings: React.FC = () => {
  const { t } = useTranslation(['settings', 'medical', 'common', 'forms']);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RecordTemplate | null>(null);
  const [form] = Form.useForm();

  const { data: templates, isLoading } = useRecordTemplates();
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
        // Update existing template. price + currencyId are intentionally
        // omitted — pricing is owned by Factura now.
        await updateMutation.mutateAsync({
          templateId: editingTemplate.id,
          input: {
            title: values.title,
            description: values.description,
          },
        });
      } else {
        // Create new template (price/currency NULL — see Factura).
        await createMutation.mutateAsync({
          recordType: values.recordType,
          title: values.title,
          description: values.description,
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
        </Form>
      </Modal>
    </Card>
  );
};

export default RecordTemplatesSettings;
