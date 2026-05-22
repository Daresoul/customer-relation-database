/**
 * ManagedScannersSettings — list of HID devices whose input is suppressed at
 * the OS level on Windows (via the Raw Input API in `raw_input_capture.rs`)
 * and routed exclusively to this app. Lets a vet's microchip reader coexist
 * with normal HID-keyboard scanners (POS, payment) without focus-stealing.
 *
 * Only meaningful on Windows. On macOS/Linux the backend module is a no-op
 * so adding rows here has no runtime effect — the table still persists for
 * cross-platform parity.
 */

import React, { useEffect, useState } from 'react';
import {
  Card,
  Button,
  Typography,
  Space,
  Table,
  Switch,
  Modal,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  App,
  Tag,
  Alert,
} from 'antd';
import { PlusOutlined, DeleteOutlined, UsbOutlined } from '@ant-design/icons';
import { invoke } from '@/services/invoke';
import { useTranslation } from 'react-i18next';

const { Text, Paragraph } = Typography;

interface ManagedHidScanner {
  id: number;
  name: string;
  vendorId: number;
  productId: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CreateInput {
  name: string;
  vendorId: number;
  productId: number;
  enabled?: boolean;
}

const formatHex = (n: number) =>
  '0x' + n.toString(16).padStart(4, '0').toUpperCase();

const ManagedScannersSettings: React.FC = () => {
  const { t } = useTranslation(['settings', 'common']);
  const { notification } = App.useApp();
  const [rows, setRows] = useState<ManagedHidScanner[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [form] = Form.useForm();

  const reload = async () => {
    setLoading(true);
    try {
      const data = await invoke<ManagedHidScanner[]>('get_managed_hid_scanners');
      setRows(data || []);
    } catch (e: any) {
      notification.error({
        message: t('common:error'),
        description: String(e),
        placement: 'bottomRight',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const handleAdd = async (values: any) => {
    const input: CreateInput = {
      name: values.name,
      vendorId: values.vendorId,
      productId: values.productId,
      enabled: values.enabled ?? true,
    };
    try {
      await invoke('create_managed_hid_scanner', { input });
      setAddOpen(false);
      form.resetFields();
      await reload();
      notification.success({
        message: t('common:success', 'Success'),
        description: t(
          'settings:managedScanners.addedDesc',
          'Scanner added — Raw Input filter will pick it up immediately.',
        ),
        placement: 'bottomRight',
      });
    } catch (e: any) {
      notification.error({
        message: t('common:error'),
        description: String(e),
        placement: 'bottomRight',
      });
    }
  };

  const handleToggle = async (row: ManagedHidScanner, enabled: boolean) => {
    try {
      await invoke('update_managed_hid_scanner', {
        id: row.id,
        input: { enabled },
      });
      await reload();
    } catch (e: any) {
      notification.error({
        message: t('common:error'),
        description: String(e),
        placement: 'bottomRight',
      });
    }
  };

  const handleDelete = async (row: ManagedHidScanner) => {
    try {
      await invoke('delete_managed_hid_scanner', { id: row.id });
      await reload();
    } catch (e: any) {
      notification.error({
        message: t('common:error'),
        description: String(e),
        placement: 'bottomRight',
      });
    }
  };

  return (
    <Card
      title={
        <Space>
          <UsbOutlined />
          <span>
            {t('settings:managedScanners.title', 'Managed HID Scanners')}
          </span>
        </Space>
      }
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setAddOpen(true)}
          data-testid="managed-scanner-add-btn"
        >
          {t('settings:managedScanners.add', 'Add scanner')}
        </Button>
      }
    >
      <Paragraph type="secondary">
        {t(
          'settings:managedScanners.description',
          'HID scanners listed here have their input captured exclusively by this app — they stop typing into other windows. Useful for microchip readers that emit chip IDs as keystrokes. Other HID scanners (e.g. POS / barcode) continue to work normally.',
        )}
      </Paragraph>

      {navigator.userAgent.toLowerCase().includes('mac') && (
        <Alert
          message={t(
            'settings:managedScanners.macOnlyTitle',
            'Windows-only feature',
          )}
          description={t(
            'settings:managedScanners.macOnlyDesc',
            'Raw Input filtering only takes effect on Windows. On macOS this list is editable for parity, but suppression and capture is handled by the existing HID-polling path instead.',
          )}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Table<ManagedHidScanner>
        rowKey="id"
        loading={loading}
        dataSource={rows}
        pagination={false}
        size="middle"
        columns={[
          {
            title: t('settings:managedScanners.name', 'Name'),
            dataIndex: 'name',
            key: 'name',
          },
          {
            title: t('settings:managedScanners.vid', 'Vendor ID'),
            dataIndex: 'vendorId',
            key: 'vendorId',
            render: (v: number) => <Tag>{formatHex(v)}</Tag>,
            width: 120,
          },
          {
            title: t('settings:managedScanners.pid', 'Product ID'),
            dataIndex: 'productId',
            key: 'productId',
            render: (v: number) => <Tag>{formatHex(v)}</Tag>,
            width: 120,
          },
          {
            title: t('settings:managedScanners.enabled', 'Enabled'),
            dataIndex: 'enabled',
            key: 'enabled',
            width: 100,
            render: (enabled: boolean, row) => (
              <Switch
                checked={enabled}
                onChange={(v) => handleToggle(row, v)}
              />
            ),
          },
          {
            title: '',
            key: 'actions',
            width: 80,
            render: (_: unknown, row) => (
              <Popconfirm
                title={t(
                  'settings:managedScanners.deleteConfirm',
                  'Delete this scanner?',
                )}
                onConfirm={() => handleDelete(row)}
              >
                <Button danger size="small" icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          },
        ]}
      />

      <Modal
        open={addOpen}
        title={t('settings:managedScanners.addTitle', 'Add managed HID scanner')}
        onCancel={() => {
          setAddOpen(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        okText={t('common:buttons.create', 'Create')}
      >
        <Form form={form} layout="vertical" onFinish={handleAdd}>
          <Form.Item
            name="name"
            label={t('settings:managedScanners.name', 'Name')}
            rules={[{ required: true, message: t('forms:validation.required') }]}
          >
            <Input
              placeholder={t(
                'settings:managedScanners.namePlaceholder',
                'e.g., W91B Microchip Reader',
              )}
              data-testid="managed-scanner-name-input"
            />
          </Form.Item>
          <Form.Item
            name="vendorId"
            label={t('settings:managedScanners.vid', 'Vendor ID (decimal)')}
            rules={[
              { required: true, message: t('forms:validation.required') },
              { type: 'integer', min: 0, max: 0xffff },
            ]}
            extra={
              <Text type="secondary">
                {t(
                  'settings:managedScanners.vidHelp',
                  'USB VID in decimal (Device Manager → Properties → Details → Hardware IDs).',
                )}
              </Text>
            }
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              max={0xffff}
              data-testid="managed-scanner-vid-input"
            />
          </Form.Item>
          <Form.Item
            name="productId"
            label={t('settings:managedScanners.pid', 'Product ID (decimal)')}
            rules={[
              { required: true, message: t('forms:validation.required') },
              { type: 'integer', min: 0, max: 0xffff },
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              max={0xffff}
              data-testid="managed-scanner-pid-input"
            />
          </Form.Item>
          <Form.Item
            name="enabled"
            label={t('settings:managedScanners.enabled', 'Enabled')}
            valuePropName="checked"
            initialValue={true}
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default ManagedScannersSettings;
