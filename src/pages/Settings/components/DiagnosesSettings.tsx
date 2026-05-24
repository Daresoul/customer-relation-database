/**
 * Diagnoses settings — CRUD for the tag-style diagnosis list used to
 * label medical records. Mirrors the shape of LineItemsSettings so the
 * UX feels consistent across master-data screens.
 *
 * Soft-delete by default (deactivate). Hard-delete is only attempted if
 * the user explicitly asks; the backend will refuse with a friendly
 * error if the diagnosis is still referenced by any medical record.
 */

import React, { useEffect, useState } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Table,
  Space,
  Modal,
  Popconfirm,
  Tag,
  Switch,
  App,
  Tooltip,
  ColorPicker,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { invoke } from '@/services/invoke';
import { useTranslation } from 'react-i18next';

const { TextArea } = Input;

interface Diagnosis {
  id: number;
  name: string;
  description?: string | null;
  color?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CreateInput {
  name: string;
  description?: string | null;
  color?: string | null;
}

interface UpdateInput {
  name?: string | null;
  description?: string | null;
  color?: string | null;
  isActive?: boolean | null;
}

/** Default tag color used when a diagnosis hasn't picked one. Picked
 *  to match the Ant Design "geekblue" — readable on light + dark
 *  themes and visually neutral so the badge doesn't scream. */
const DEFAULT_TAG_COLOR = '#2f54eb';

const DiagnosesSettings: React.FC = () => {
  const { t } = useTranslation(['settings', 'common']);
  const { notification } = App.useApp();
  const [rows, setRows] = useState<Diagnosis[]>([]);
  const [loading, setLoading] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Diagnosis | null>(null);
  const [form] = Form.useForm();

  const reload = async () => {
    setLoading(true);
    try {
      const data = await invoke<Diagnosis[]>('get_diagnoses', {
        activeOnly: !showInactive,
      });
      setRows(data || []);
    } catch (e: any) {
      notification.error({
        message: t('common:error', 'Error'),
        description: String(e),
        placement: 'bottomRight',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // showInactive change re-fetches so the table reflects the current filter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  const handleAddClick = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ color: DEFAULT_TAG_COLOR });
    setModalOpen(true);
  };

  const handleEdit = (d: Diagnosis) => {
    setEditing(d);
    form.setFieldsValue({
      name: d.name,
      description: d.description ?? '',
      color: d.color ?? DEFAULT_TAG_COLOR,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (values: any) => {
    // Ant's ColorPicker passes a Color object when interacted with; if
    // untouched it stays as the string we seeded. Normalize both forms
    // to a hex string for the backend.
    const colorRaw = values.color;
    const colorStr =
      typeof colorRaw === 'string'
        ? colorRaw
        : colorRaw && typeof colorRaw.toHexString === 'function'
          ? colorRaw.toHexString()
          : null;

    try {
      if (editing) {
        const input: UpdateInput = {
          name: values.name,
          description: values.description?.trim() || null,
          color: colorStr || null,
        };
        await invoke('update_diagnosis', { id: editing.id, input });
      } else {
        const input: CreateInput = {
          name: values.name,
          description: values.description?.trim() || null,
          color: colorStr || null,
        };
        await invoke('create_diagnosis', { input });
      }
      setModalOpen(false);
      form.resetFields();
      setEditing(null);
      await reload();
      notification.success({
        message: t('common:success', 'Success'),
        description: editing
          ? t('settings:diagnoses.updated', 'Diagnosis updated')
          : t('settings:diagnoses.created', 'Diagnosis created'),
        placement: 'bottomRight',
      });
    } catch (e: any) {
      notification.error({
        message: t('common:error', 'Error'),
        description: String(e),
        placement: 'bottomRight',
      });
    }
  };

  const handleDeactivate = async (d: Diagnosis) => {
    try {
      await invoke('delete_diagnosis', { id: d.id, hardDelete: false });
      await reload();
    } catch (e: any) {
      notification.error({
        message: t('common:error', 'Error'),
        description: String(e),
        placement: 'bottomRight',
      });
    }
  };

  const handleReactivate = async (d: Diagnosis) => {
    try {
      await invoke('update_diagnosis', {
        id: d.id,
        input: { isActive: true },
      });
      await reload();
    } catch (e: any) {
      notification.error({
        message: t('common:error', 'Error'),
        description: String(e),
        placement: 'bottomRight',
      });
    }
  };

  return (
    <Card
      title={
        <Space>
          <FileTextOutlined />
          <span>{t('settings:diagnoses.title', 'Diagnoses')}</span>
        </Space>
      }
      extra={
        <Space>
          <span>{t('settings:diagnoses.showInactive', 'Show inactive')}</span>
          <Switch
            checked={showInactive}
            onChange={setShowInactive}
            size="small"
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAddClick}
            data-testid="diagnoses-add-btn"
          >
            {t('settings:diagnoses.add', 'Add diagnosis')}
          </Button>
        </Space>
      }
    >
      <p style={{ color: '#666', marginBottom: 16 }}>
        {t(
          'settings:diagnoses.description',
          'Manage the list of diagnosis tags that can be applied to medical records. Examples: Arthritis, Otitis externa, Hyperthyroidism.',
        )}
      </p>

      <Table<Diagnosis>
        rowKey="id"
        loading={loading}
        dataSource={rows}
        pagination={false}
        size="middle"
        columns={[
          {
            title: t('settings:diagnoses.name', 'Name'),
            dataIndex: 'name',
            key: 'name',
            render: (name: string, row) => (
              <Tag color={row.color || DEFAULT_TAG_COLOR} style={{ fontSize: 13 }}>
                {name}
              </Tag>
            ),
          },
          {
            // Distinct key from `settings:diagnoses.description` (which is
            // the long page-intro sentence above the table). Reusing the
            // same key here made the table column header render the
            // entire intro paragraph — caught in v0.5.15 review.
            title: t('settings:diagnoses.descriptionColumn', 'Description'),
            dataIndex: 'description',
            key: 'description',
            render: (text: string | null) =>
              text || <span style={{ color: '#bbb' }}>—</span>,
          },
          {
            title: t('settings:diagnoses.status', 'Status'),
            dataIndex: 'isActive',
            key: 'isActive',
            width: 110,
            render: (isActive: boolean) =>
              isActive ? (
                <Tag color="green">{t('common:active', 'Active')}</Tag>
              ) : (
                <Tag>{t('common:inactive', 'Inactive')}</Tag>
              ),
          },
          {
            title: '',
            key: 'actions',
            width: 160,
            render: (_: unknown, row) => (
              <Space>
                <Tooltip title={t('common:edit', 'Edit')}>
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => handleEdit(row)}
                  />
                </Tooltip>
                {row.isActive ? (
                  <Popconfirm
                    title={t(
                      'settings:diagnoses.deactivateConfirm',
                      'Hide this diagnosis from the picker?',
                    )}
                    description={t(
                      'settings:diagnoses.deactivateDesc',
                      'Existing records that already use it stay unchanged.',
                    )}
                    onConfirm={() => handleDeactivate(row)}
                    okText={t('common:yes', 'Yes')}
                    cancelText={t('common:cancel', 'Cancel')}
                  >
                    <Button danger size="small" icon={<DeleteOutlined />} />
                  </Popconfirm>
                ) : (
                  <Tooltip title={t('common:reactivate', 'Reactivate')}>
                    <Button
                      size="small"
                      icon={<UndoOutlined />}
                      onClick={() => handleReactivate(row)}
                    />
                  </Tooltip>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        open={modalOpen}
        title={
          editing
            ? t('settings:diagnoses.editTitle', 'Edit diagnosis')
            : t('settings:diagnoses.addTitle', 'Add diagnosis')
        }
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
          setEditing(null);
        }}
        onOk={() => form.submit()}
        okText={editing ? t('common:save', 'Save') : t('common:create', 'Create')}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="name"
            label={t('settings:diagnoses.name', 'Name')}
            rules={[
              { required: true, message: t('forms:validation.required', 'Required') },
              { max: 100, message: t('forms:validation.maxLength', { max: 100 }) },
            ]}
          >
            <Input
              placeholder={t(
                'settings:diagnoses.namePlaceholder',
                'e.g., Arthritis',
              )}
              data-testid="diagnosis-name-input"
            />
          </Form.Item>
          <Form.Item
            name="description"
            label={t('settings:diagnoses.descriptionColumn', 'Description')}
          >
            <TextArea
              rows={3}
              placeholder={t(
                'settings:diagnoses.descriptionPlaceholder',
                'Optional clinical description for staff reference',
              )}
            />
          </Form.Item>
          <Form.Item
            name="color"
            label={t('settings:diagnoses.color', 'Tag color')}
          >
            <ColorPicker showText format="hex" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default DiagnosesSettings;
