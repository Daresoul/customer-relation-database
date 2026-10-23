import React, { useState } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, Select, Tag, Popconfirm, InputNumber, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, FileTextOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
  useRecordTemplates,
  useCreateRecordTemplate,
  useUpdateRecordTemplate,
  useDeleteRecordTemplate,
} from '@/hooks/useRecordTemplates';
import { useLineItemTemplates } from '@/hooks/useLineItemTemplates';
import { useDiagnoses } from '@/hooks/useDiagnoses';
import type { RecordTemplate, RecordTemplateLineItemInput, RecordType } from '@/types/medical';
import type { ColumnsType } from 'antd/es/table';

// Pricing lives on the template's price-list lines; the old `price` and
// `currency_id` columns stay in the table for existing rows but are unused.

const { TextArea } = Input;
const { Option } = Select;
const { Text } = Typography;

interface TemplateFormValues {
  recordType: RecordType;
  title: string;
  description: string;
  prescriptionNotes?: string;
  lineItems?: Array<{ lineItemTemplateId?: number; quantity?: number }>;
  diagnosisIds?: number[];
}

const RecordTemplatesSettings: React.FC = () => {
  const { t } = useTranslation(['settings', 'medical', 'common', 'forms']);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RecordTemplate | null>(null);
  const [form] = Form.useForm<TemplateFormValues>();

  const { data: templates, isLoading } = useRecordTemplates();
  const { data: priceList = [] } = useLineItemTemplates(true);
  const { data: diagnoses = [] } = useDiagnoses(true);
  const createMutation = useCreateRecordTemplate();
  const updateMutation = useUpdateRecordTemplate();
  const deleteMutation = useDeleteRecordTemplate();

  // Active price-list items, plus removed ones the open template still has.
  const priceOptions = [
    ...priceList.map((p) => ({ value: p.id, label: p.name })),
    ...(editingTemplate?.lineItems ?? [])
      .filter((l) => !priceList.some((p) => p.id === l.lineItemTemplateId))
      .map((l) => ({ value: l.lineItemTemplateId, label: `${l.name} (${t('settings:templates.removedItem')})` })),
  ];

  const handleCreate = () => {
    setEditingTemplate(null);
    form.resetFields();
    form.setFieldsValue({ recordType: 'note', lineItems: [], diagnosisIds: [] });
    setIsModalOpen(true);
  };

  const handleEdit = (template: RecordTemplate) => {
    setEditingTemplate(template);
    form.setFieldsValue({
      recordType: template.recordType,
      title: template.title,
      description: template.description,
      prescriptionNotes: template.prescriptionNotes ?? '',
      lineItems: (template.lineItems ?? []).map((l) => ({ lineItemTemplateId: l.lineItemTemplateId, quantity: l.quantity })),
      diagnosisIds: template.diagnosisIds ?? [],
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
      const input = {
        recordType: values.recordType,
        title: values.title,
        description: values.description,
        prescriptionNotes: values.prescriptionNotes ?? '',
        lineItems: (values.lineItems ?? [])
          .filter((l): l is RecordTemplateLineItemInput => l.lineItemTemplateId != null)
          .map((l) => ({ lineItemTemplateId: l.lineItemTemplateId, quantity: l.quantity ?? 1 })),
        diagnosisIds: values.diagnosisIds ?? [],
      };

      if (editingTemplate) {
        await updateMutation.mutateAsync({ templateId: editingTemplate.id, input });
      } else {
        await createMutation.mutateAsync(input);
      }

      setIsModalOpen(false);
      form.resetFields();
      setEditingTemplate(null);
    } catch (error) {
      console.error('Saving the template failed:', error);
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
      title: t('settings:templates.fills'),
      key: 'fills',
      render: (_, record) => (
        <Space size={4} wrap>
          {record.prescriptionNotes && <Tag>{t('medical:fields.prescriptionNotes')}</Tag>}
          {(record.lineItems ?? []).map((l) => (
            <Tag key={l.lineItemTemplateId} color={l.isActive ? 'gold' : 'default'}>
              {l.quantity > 1 ? `${l.quantity} × ${l.name}` : l.name}
            </Tag>
          ))}
          {(record.diagnosisIds ?? []).length > 0 && (
            <Tag color="cyan">{t('settings:templates.diagnosesCount', { count: record.diagnosisIds!.length })}</Tag>
          )}
        </Space>
      ),
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
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        {t('settings:templates.hint')}
      </Text>
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
        width={680}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ recordType: 'note', lineItems: [], diagnosisIds: [] }}
        >
          <Form.Item
            name="recordType"
            label={t('medical:fields.recordType')}
            rules={[{ required: true, message: t('forms:validation.required') }]}
          >
            <Select data-testid="template-record-type" virtual={false}>
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

          <Form.Item name="prescriptionNotes" label={t('medical:fields.prescriptionNotes')}>
            <TextArea rows={3} placeholder={t('settings:templates.prescriptionPlaceholder')} showCount maxLength={5000} />
          </Form.Item>

          <Form.Item label={t('settings:templates.lines')} extra={t('settings:templates.linesHint')}>
            <Form.List name="lineItems">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((field, index) => (
                    <Space key={field.key} align="baseline" data-testid={`template-line-${index}`} style={{ display: 'flex' }}>
                      <Form.Item
                        name={[field.name, 'lineItemTemplateId']}
                        rules={[{ required: true, message: t('forms:validation.required') }]}
                        style={{ marginBottom: 8 }}
                      >
                        <Select
                          showSearch
                          virtual={false}
                          optionFilterProp="label"
                          options={priceOptions}
                          style={{ width: 360 }}
                          placeholder={t('settings:templates.lineItem')}
                          aria-label={t('settings:templates.lineItem')}
                        />
                      </Form.Item>
                      <Form.Item name={[field.name, 'quantity']} initialValue={1} style={{ marginBottom: 8 }}>
                        <InputNumber min={1} precision={0} aria-label={t('settings:templates.quantity')} />
                      </Form.Item>
                      <MinusCircleOutlined
                        aria-label={t('settings:templates.removeLine')}
                        onClick={() => remove(field.name)}
                      />
                    </Space>
                  ))}
                  <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ quantity: 1 })}>
                    {t('settings:templates.addLine')}
                  </Button>
                </>
              )}
            </Form.List>
          </Form.Item>

          <Form.Item name="diagnosisIds" label={t('medical:fields.diagnoses')}>
            <Select
              mode="multiple"
              allowClear
              virtual={false}
              data-testid="template-diagnoses"
              optionFilterProp="label"
              options={diagnoses.map((d) => ({ value: d.id, label: d.name }))}
              placeholder={t('medical:placeholders.selectDiagnoses')}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default RecordTemplatesSettings;
