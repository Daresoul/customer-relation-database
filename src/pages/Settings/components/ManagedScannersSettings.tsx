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

import React, { useEffect, useState, useCallback } from 'react';
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
  Checkbox,
  Collapse,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  UsbOutlined,
  ReloadOutlined,
  WifiOutlined,
} from '@ant-design/icons';
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

/** Mirrors `models::hid_devices::HidConnectionKind`. */
type HidConnectionKind = 'usb' | 'bluetooth' | 'bluetoothLe' | 'unknown';

/** Mirrors `models::hid_devices::HidDeviceInfo`. */
interface HidDeviceInfo {
  vendorId: number;
  productId: number;
  vendorIdHex: string;
  productIdHex: string;
  productName: string | null;
  manufacturer: string | null;
  serialNumber: string | null;
  vendorNameFromDb: string | null;
  /** BT pairing friendly name from the Windows Bluetooth subsystem
   *  (e.g. "SYC Bluetooth"). Only set for BT devices whose serial is a
   *  MAC matching a paired-device entry. */
  bluetoothName: string | null;
  usagePage: number;
  usage: number;
  interfaceNumber: number;
  connection: HidConnectionKind;
  alreadyManaged: boolean;
  looksLikeKeyboard: boolean;
  looksLikeScanner: boolean;
}

const formatHex = (n: number) =>
  '0x' + n.toString(16).padStart(4, '0').toUpperCase();

/** Stable React key for a detection-table row — VID/PID alone aren't unique
 *  on composite devices (e.g. a chip reader exposing multiple interfaces),
 *  so we mix in the interface number. */
const detectRowKey = (d: HidDeviceInfo) =>
  `${d.vendorIdHex}-${d.productIdHex}-${d.interfaceNumber}-${d.usagePage}-${d.usage}`;

const ManagedScannersSettings: React.FC = () => {
  const { t } = useTranslation(['settings', 'common']);
  const { notification } = App.useApp();
  const [rows, setRows] = useState<ManagedHidScanner[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  // Tracks whether a create/update/delete is in flight so the Modal's
  // OK button can show a spinner. Without this the modal looks frozen
  // while we wait for the backend to write the row and reload the
  // Raw Input filter list.
  const [submitting, setSubmitting] = useState(false);
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

  // --- Detection table state ---
  // The detection table is collapsed by default so the settings page stays
  // clean. Opening it triggers an initial scan; the Refresh button re-runs
  // hidapi enumeration on the backend (which runs on a blocking thread so
  // the UI never stalls). hidapi calls in this command never open any
  // device for I/O — see `commands::hid_devices` module docs for the rule.
  const [detected, setDetected] = useState<HidDeviceInfo[]>([]);
  const [detectLoading, setDetectLoading] = useState(false);
  const [detectAt, setDetectAt] = useState<Date | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [showAllHid, setShowAllHid] = useState(false);

  const refreshDetected = useCallback(async () => {
    setDetectLoading(true);
    setDetectError(null);
    try {
      const data = await invoke<HidDeviceInfo[]>('list_hid_devices');
      setDetected(data || []);
      setDetectAt(new Date());
    } catch (e: any) {
      setDetectError(String(e));
      notification.error({
        message: t('common:error'),
        description: String(e),
        placement: 'bottomRight',
      });
    } finally {
      setDetectLoading(false);
    }
  }, [notification, t]);

  const handleAddFromDetected = (d: HidDeviceInfo) => {
    // Pre-fill name with the most informative string available, in order:
    //   bluetoothName (BT pairing label, e.g. "SYC Bluetooth")
    //   > productName (HID descriptor)
    //   > manufacturer + " HID device"
    //   > vendor name from USB-IF db
    //   > generic "HID device VID:PID"
    const suggestedName =
      d.bluetoothName ||
      d.productName ||
      (d.manufacturer ? `${d.manufacturer} HID device` : null) ||
      d.vendorNameFromDb ||
      `HID device ${d.vendorIdHex}:${d.productIdHex}`;
    form.setFieldsValue({
      name: suggestedName,
      vendorId: d.vendorId,
      productId: d.productId,
      enabled: true,
    });
    setAddOpen(true);
  };

  const visibleDetected = showAllHid
    ? detected
    : detected.filter((d) => d.looksLikeKeyboard || d.looksLikeScanner);

  const handleAdd = async (values: any) => {
    const input: CreateInput = {
      name: values.name,
      vendorId: values.vendorId,
      productId: values.productId,
      enabled: values.enabled ?? true,
    };
    setSubmitting(true);
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
    } finally {
      setSubmitting(false);
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

      <Collapse
        style={{ marginBottom: 16 }}
        onChange={(keys) => {
          // Lazy-load on first expand. If user re-collapses and re-opens
          // without refreshing, keep the previous result — they can hit
          // Refresh explicitly if it's stale.
          const expanded = Array.isArray(keys) ? keys.includes('detect') : keys === 'detect';
          if (expanded && detected.length === 0 && !detectLoading) {
            void refreshDetected();
          }
        }}
        items={[
          {
            key: 'detect',
            label: (
              <Space>
                <span>
                  {t(
                    'settings:managedScanners.detect.title',
                    'Detect connected HID devices',
                  )}
                </span>
                {detectAt && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {t('settings:managedScanners.detect.lastScanned', 'Last scanned')}:{' '}
                    {detectAt.toLocaleTimeString()}
                  </Text>
                )}
              </Space>
            ),
            children: (
              <>
                <Space style={{ marginBottom: 12 }} wrap>
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={refreshDetected}
                    loading={detectLoading}
                    data-testid="hid-detect-refresh-btn"
                  >
                    {t('settings:managedScanners.detect.refresh', 'Refresh')}
                  </Button>
                  <Checkbox
                    checked={showAllHid}
                    onChange={(e) => setShowAllHid(e.target.checked)}
                  >
                    {t(
                      'settings:managedScanners.detect.showAll',
                      'Show all HID devices (not just keyboards/scanners)',
                    )}
                  </Checkbox>
                </Space>

                {detectError && (
                  <Alert
                    type="error"
                    message={detectError}
                    showIcon
                    style={{ marginBottom: 12 }}
                  />
                )}

                <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
                  {t(
                    'settings:managedScanners.detect.help',
                    'Lists devices currently attached. Click "Add" on any row to add it to the managed list with VID/PID and name pre-filled. The scan only reads metadata — devices are NOT opened, so other software keeps working normally.',
                  )}
                </Paragraph>

                <Table<HidDeviceInfo>
                  rowKey={detectRowKey}
                  loading={detectLoading}
                  dataSource={visibleDetected}
                  pagination={false}
                  size="small"
                  scroll={{ y: 320 }}
                  columns={[
                    {
                      title: t('settings:managedScanners.detect.colName', 'Device'),
                      key: 'name',
                      render: (_: unknown, d) => {
                        // Primary line, in priority order:
                        //   1. BT pairing name (what the user named it in
                        //      Windows Settings — most recognizable)
                        //   2. HID product string (set by the device firmware)
                        //   3. USB-IF vendor name (e.g. "Apple, Inc." for
                        //      VID 0x05AC even when the device spoofs)
                        //   4. Fallback placeholder
                        const primary =
                          d.bluetoothName ||
                          d.productName ||
                          d.vendorNameFromDb ||
                          t('settings:managedScanners.detect.unnamed', '(unnamed)');
                        // Secondary line shows additional context that's
                        // useful for distinguishing devices but isn't the
                        // primary identifier. If the primary is the BT
                        // name, show product string as secondary (or
                        // manufacturer). Otherwise show manufacturer.
                        const secondary =
                          d.bluetoothName && d.productName
                            ? d.productName
                            : d.manufacturer ?? d.vendorNameFromDb;
                        return (
                          <Space direction="vertical" size={0}>
                            <Text strong>{primary}</Text>
                            {secondary && secondary !== primary && (
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                {secondary}
                              </Text>
                            )}
                            {d.serialNumber && (
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                S/N: {d.serialNumber}
                              </Text>
                            )}
                          </Space>
                        );
                      },
                    },
                    {
                      title: t('settings:managedScanners.detect.colVid', 'VID'),
                      key: 'vid',
                      width: 110,
                      render: (_: unknown, d) => (
                        <Tooltip title={`Decimal: ${d.vendorId}`}>
                          <Tag>0x{d.vendorIdHex}</Tag>
                        </Tooltip>
                      ),
                    },
                    {
                      title: t('settings:managedScanners.detect.colPid', 'PID'),
                      key: 'pid',
                      width: 110,
                      render: (_: unknown, d) => (
                        <Tooltip title={`Decimal: ${d.productId}`}>
                          <Tag>0x{d.productIdHex}</Tag>
                        </Tooltip>
                      ),
                    },
                    {
                      title: t('settings:managedScanners.detect.colConn', 'Connection'),
                      key: 'connection',
                      width: 130,
                      render: (_: unknown, d) => {
                        switch (d.connection) {
                          case 'usb':
                            return (
                              <Tag icon={<UsbOutlined />} color="default">
                                USB
                              </Tag>
                            );
                          case 'bluetooth':
                            return (
                              <Tag icon={<WifiOutlined />} color="blue">
                                Bluetooth
                              </Tag>
                            );
                          case 'bluetoothLe':
                            return (
                              <Tag icon={<WifiOutlined />} color="cyan">
                                Bluetooth LE
                              </Tag>
                            );
                          default:
                            return <Tag>Unknown</Tag>;
                        }
                      },
                    },
                    {
                      title: t('settings:managedScanners.detect.colType', 'Type'),
                      key: 'type',
                      width: 130,
                      render: (_: unknown, d) => (
                        <Space size={4} wrap>
                          {d.looksLikeKeyboard && (
                            <Tag color="geekblue">
                              {t('settings:managedScanners.detect.kbd', 'Keyboard')}
                            </Tag>
                          )}
                          {d.looksLikeScanner && (
                            <Tag color="purple">
                              {t('settings:managedScanners.detect.scanner', 'Scanner')}
                            </Tag>
                          )}
                        </Space>
                      ),
                    },
                    {
                      title: '',
                      key: 'action',
                      width: 110,
                      render: (_: unknown, d) =>
                        d.alreadyManaged ? (
                          <Tag color="green">
                            {t('settings:managedScanners.detect.managed', 'Managed')}
                          </Tag>
                        ) : (
                          <Button
                            type="primary"
                            size="small"
                            icon={<PlusOutlined />}
                            onClick={() => handleAddFromDetected(d)}
                            data-testid={`hid-detect-add-${d.vendorIdHex}-${d.productIdHex}`}
                          >
                            {t('settings:managedScanners.detect.add', 'Add')}
                          </Button>
                        ),
                    },
                  ]}
                  locale={{
                    emptyText: detectLoading
                      ? t('common:loading', 'Loading...')
                      : t(
                          'settings:managedScanners.detect.empty',
                          'No HID devices found. Plug in your scanner and click Refresh.',
                        ),
                  }}
                />
              </>
            ),
          },
        ]}
      />

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
          if (submitting) return;
          setAddOpen(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={submitting}
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
