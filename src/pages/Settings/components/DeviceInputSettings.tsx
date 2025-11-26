import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Typography, Space, Tag, Modal, Form, Input, Select, InputNumber, Switch, Popconfirm, AutoComplete } from 'antd';
import { UsbOutlined, ReloadOutlined, ApiOutlined, PlusOutlined, EditOutlined, DeleteOutlined, PoweroffOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api';
import { open } from '@tauri-apps/api/dialog';
import styles from '../Settings.module.css';
import {
  useDeviceIntegrations,
  useCreateDeviceIntegration,
  useUpdateDeviceIntegration,
  useDeleteDeviceIntegration,
  useToggleDeviceIntegration,
  useDeviceConnectionStatus
} from '../../../hooks/useDeviceIntegrations';
import {
  DeviceIntegration,
  DeviceType,
  ConnectionType,
  ConnectionState,
  getDeviceTypeDisplayName,
  getConnectionTypeDisplayName
} from '../../../types/deviceIntegration';

const { Text } = Typography;

interface UsbInfo {
  vid: number;
  pid: number;
  serial_number?: string;
  manufacturer?: string;
  product?: string;
  path?: string;
}

type PortType =
  | { SerialUSBPort: UsbInfo }
  | { HIDDevice: UsbInfo }
  | 'SerialPciPort'
  | 'SerialBluetoothPort'
  | 'SerialUnknown';

interface PortInfo {
  port_name: string;
  port_type: PortType;
}

const DeviceInputSettings: React.FC = () => {
  const { t } = useTranslation(['devices', 'common']);
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [loading, setLoading] = useState(false);

  // Device integrations state
  const [integrationModalVisible, setIntegrationModalVisible] = useState(false);
  const [editingIntegration, setEditingIntegration] = useState<DeviceIntegration | null>(null);
  const [integrationForm] = Form.useForm();

  const { data: integrations = [], isLoading: integrationsLoading, refetch: refetchIntegrations } = useDeviceIntegrations();
  const createIntegrationMutation = useCreateDeviceIntegration();
  const updateIntegrationMutation = useUpdateDeviceIntegration();
  const deleteIntegrationMutation = useDeleteDeviceIntegration();
  const toggleIntegrationMutation = useToggleDeviceIntegration();
  const { getStatus } = useDeviceConnectionStatus();

  // Helper to render connection status indicator
  const renderConnectionStatus = (integration: DeviceIntegration) => {
    // Only show status for serial port connections
    if (integration.connection_type !== 'serial_port') {
      return null;
    }

    const status = getStatus(integration.id);

    if (!status) {
      // No status yet - show gray (unknown)
      return (
        <span
          title={t('messages.statusUnknown')}
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: '#d9d9d9',
            marginRight: 8,
          }}
        />
      );
    }

    const getStatusColor = (state: ConnectionState): string => {
      switch (state) {
        case 'Connected':
          return '#52c41a'; // green
        case 'Connecting':
          return '#faad14'; // yellow
        case 'Disconnected':
        case 'Error':
          return '#ff4d4f'; // red
        default:
          return '#d9d9d9'; // gray
      }
    };

    const getStatusTitle = (): string => {
      switch (status.status) {
        case 'Connected':
          return t('status.connected');
        case 'Connecting':
          return t('status.connectingAttempt', { count: status.retry_count + 1 });
        case 'Disconnected':
          return t('status.disconnectedRetrying');
        case 'Error':
          return t('status.errorRetrying', { message: status.last_error || t('status.unknown') });
        default:
          return t('messages.statusUnknown');
      }
    };

    return (
      <span
        title={getStatusTitle()}
        style={{
          display: 'inline-block',
          width: 10,
          height: 10,
          borderRadius: '50%',
          backgroundColor: getStatusColor(status.status),
          marginRight: 8,
          animation: status.status === 'Connecting' ? 'pulse 1.5s infinite' : undefined,
        }}
      />
    );
  };

  const fetchPorts = async () => {
    setLoading(true);
    try {
      const result = await invoke<PortInfo[]>('get_available_ports');
      setPorts(result);
    } catch (_error) {
      // Silent fail - ports list is optional
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPorts();
  }, []);

  const getPortTypeDisplay = (portType: PortType): { text: string; color: string } => {
    if (typeof portType === 'object' && 'SerialUSBPort' in portType) {
      return { text: t('portTypes.serialUsb'), color: 'blue' };
    }
    if (typeof portType === 'object' && 'HIDDevice' in portType) {
      return { text: t('portTypes.hid'), color: 'purple' };
    }
    if (portType === 'SerialPciPort') {
      return { text: t('portTypes.serialPci'), color: 'green' };
    }
    if (portType === 'SerialBluetoothPort') {
      return { text: t('portTypes.serialBluetooth'), color: 'cyan' };
    }
    return { text: t('portTypes.unknown'), color: 'default' };
  };

  const getPortDetails = (portType: PortType): string | null => {
    if (typeof portType === 'object' && 'SerialUSBPort' in portType) {
      const usb = portType.SerialUSBPort;
      const parts = [];
      if (usb.manufacturer) parts.push(usb.manufacturer);
      if (usb.product) parts.push(usb.product);
      if (usb.serial_number) parts.push(`SN: ${usb.serial_number}`);
      return parts.length > 0 ? parts.join(' - ') : null;
    }
    if (typeof portType === 'object' && 'HIDDevice' in portType) {
      const hid = portType.HIDDevice;
      const parts = [];
      parts.push(`VID: ${hid.vid.toString(16).toUpperCase().padStart(4, '0')}`);
      parts.push(`PID: ${hid.pid.toString(16).toUpperCase().padStart(4, '0')}`);
      if (hid.manufacturer) parts.push(hid.manufacturer);
      if (hid.serial_number) parts.push(`SN: ${hid.serial_number}`);
      return parts.join(' - ');
    }
    return null;
  };

  // Device integration handlers
  const handleAddIntegration = () => {
    setEditingIntegration(null);
    integrationForm.resetFields();
    fetchPorts(); // Refresh available ports when opening modal
    setIntegrationModalVisible(true);
  };

  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t('modal.selectDirectory'),
      });

      if (selected && typeof selected === 'string') {
        integrationForm.setFieldsValue({ watch_directory: selected });
      }
    } catch (_error) {
      // Silent fail - folder selection cancelled
    }
  };

  // Get available connection types for a device
  const getConnectionTypesForDevice = (deviceType: DeviceType | undefined): ConnectionType[] => {
    if (!deviceType) return ['file_watch', 'serial_port', 'hl7_tcp'];

    switch (deviceType) {
      case 'exigo_eos_vet':
        return ['file_watch']; // Only supports file export
      case 'healvet_hv_fia3000':
        return ['serial_port']; // Only supports serial communication
      case 'mnchip_pointcare_pcr_v1':
        return ['file_watch', 'serial_port']; // Supports both
      default:
        return ['file_watch', 'serial_port', 'hl7_tcp'];
    }
  };

  const handleEditIntegration = (integration: DeviceIntegration) => {
    setEditingIntegration(integration);
    fetchPorts(); // Refresh available ports when opening modal
    integrationForm.setFieldsValue({
      name: integration.name,
      device_type: integration.device_type,
      connection_type: integration.connection_type,
      watch_directory: integration.watch_directory,
      file_pattern: integration.file_pattern,
      serial_port_name: integration.serial_port_name,
      tcp_host: integration.tcp_host,
      tcp_port: integration.tcp_port,
      enabled: integration.enabled,
    });
    setIntegrationModalVisible(true);
  };

  const handleDeleteIntegration = async (id: number) => {
    try {
      await deleteIntegrationMutation.mutateAsync(id);
      refetchIntegrations();
    } catch (_error) {
      // Error handled by mutation
    }
  };

  const handleToggleIntegration = async (id: number) => {
    try {
      await toggleIntegrationMutation.mutateAsync(id);
      refetchIntegrations();
    } catch (_error) {
      // Error handled by mutation
    }
  };

  const handleIntegrationSubmit = async (values: any) => {
    try {
      const integrationData = {
        name: values.name,
        device_type: values.device_type as DeviceType,
        connection_type: values.connection_type as ConnectionType,
        watch_directory: values.watch_directory || undefined,
        file_pattern: values.file_pattern || undefined,
        serial_port_name: values.serial_port_name || undefined,
        serial_baud_rate: values.serial_baud_rate || undefined,
        tcp_host: values.tcp_host || undefined,
        tcp_port: values.tcp_port || undefined,
      };

      if (editingIntegration) {
        // Stop existing listener before updating (if enabled and config changed)
        const configChanged =
          editingIntegration.serial_port_name !== values.serial_port_name ||
          editingIntegration.watch_directory !== values.watch_directory ||
          editingIntegration.file_pattern !== values.file_pattern ||
          editingIntegration.tcp_host !== values.tcp_host ||
          editingIntegration.tcp_port !== values.tcp_port;

        if (editingIntegration.enabled && configChanged) {
          try {
            await invoke('stop_device_integration_listener', { integrationId: editingIntegration.id });
          } catch (_stopError) {
            // Ignore stop errors - listener might not be running
          }
        }

        const updateData = { ...integrationData, enabled: values.enabled };
        await updateIntegrationMutation.mutateAsync({
          id: editingIntegration.id,
          data: updateData,
        });

        // Restart listener if still enabled and config changed
        if (values.enabled && configChanged) {
          try {
            await invoke('start_device_integration_listener', { integrationId: editingIntegration.id });
          } catch (_startError) {
            // Error will be reflected in connection status
          }
        }
      } else {
        await createIntegrationMutation.mutateAsync(integrationData);
      }

      setIntegrationModalVisible(false);
      integrationForm.resetFields();
      setEditingIntegration(null);
      refetchIntegrations();
    } catch (_error) {
      // Error handled by mutation
    }
  };

  // Device integrations table columns
  const integrationColumns = [
    {
      title: t('table.name'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: DeviceIntegration) => (
        <Space>
          {renderConnectionStatus(record)}
          <Text strong>{text}</Text>
          {!record.enabled && <Tag color="default">{t('status.disabled')}</Tag>}
        </Space>
      ),
    },
    {
      title: t('table.device'),
      dataIndex: 'device_type',
      key: 'device_type',
      render: (deviceType: DeviceType) => (
        <Tag color="blue">{getDeviceTypeDisplayName(deviceType)}</Tag>
      ),
    },
    {
      title: t('table.connection'),
      dataIndex: 'connection_type',
      key: 'connection_type',
      render: (connectionType: ConnectionType) => (
        <Tag color="green">{getConnectionTypeDisplayName(connectionType)}</Tag>
      ),
    },
    {
      title: t('table.configuration'),
      key: 'config',
      render: (_: any, record: DeviceIntegration) => {
        if (record.connection_type === 'file_watch') {
          return <Text type="secondary">{record.watch_directory || '-'}</Text>;
        } else if (record.connection_type === 'serial_port') {
          return <Text type="secondary">{record.serial_port_name || '-'}</Text>;
        } else if (record.connection_type === 'hl7_tcp') {
          return <Text type="secondary">{record.tcp_host ? `${record.tcp_host}:${record.tcp_port}` : '-'}</Text>;
        }
        return <Text type="secondary">-</Text>;
      },
    },
    {
      title: t('table.actions'),
      key: 'actions',
      render: (_: any, record: DeviceIntegration) => (
        <Space>
          <Button
            icon={<PoweroffOutlined />}
            size="small"
            type={record.enabled ? 'default' : 'primary'}
            onClick={() => handleToggleIntegration(record.id)}
            loading={toggleIntegrationMutation.isPending}
          >
            {record.enabled ? t('buttons.disable') : t('buttons.enable')}
          </Button>
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => handleEditIntegration(record)}
          >
            {t('common:edit')}
          </Button>
          <Popconfirm
            title={t('messages.deleteConfirm')}
            onConfirm={() => handleDeleteIntegration(record.id)}
            okText={t('common:yes')}
            cancelText={t('common:no')}
          >
            <Button
              icon={<DeleteOutlined />}
              size="small"
              danger
              loading={deleteIntegrationMutation.isPending}
            >
              {t('common:delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const columns = [
    {
      title: t('table.portName'),
      dataIndex: 'port_name',
      key: 'port_name',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: t('table.type'),
      dataIndex: 'port_type',
      key: 'type',
      render: (portType: PortType) => {
        const { text, color } = getPortTypeDisplay(portType);
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: t('table.details'),
      dataIndex: 'port_type',
      key: 'details',
      render: (portType: PortType) => {
        const details = getPortDetails(portType);
        return details ? <Text type="secondary">{details}</Text> : <Text type="secondary">-</Text>;
      },
    },
  ];

  return (
    <div>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Card
          title={
            <span className={styles.cardTitle}>
              <UsbOutlined /> {t('sections.availableDevices')}
            </span>
          }
          className={styles.settingsCard}
          extra={
            <Button
              icon={<ReloadOutlined />}
              onClick={fetchPorts}
              loading={loading}
              type="text"
            >
              {t('buttons.refresh')}
            </Button>
          }
        >
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <Text type="secondary">
              <ApiOutlined /> {t('messages.detectedDevices', { count: ports.length })}
            </Text>

            <Table
              columns={columns}
              dataSource={ports}
              rowKey={(record, index) => `${record.port_name || 'unknown'}-${index}`}
              loading={loading}
              pagination={false}
              size="middle"
            />
          </Space>
        </Card>

        <Card
          title={
            <span className={styles.cardTitle}>
              <ApiOutlined /> {t('sections.integrations')}
            </span>
          }
          className={styles.settingsCard}
          extra={
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAddIntegration}
            >
              {t('buttons.addIntegration')}
            </Button>
          }
        >
          <Table
            columns={integrationColumns}
            dataSource={integrations}
            rowKey="id"
            loading={integrationsLoading}
            pagination={false}
            size="middle"
          />
        </Card>
      </Space>

      {/* Add/Edit Integration Modal */}
      <Modal
        title={editingIntegration ? t('modal.editTitle') : t('modal.addTitle')}
        open={integrationModalVisible}
        onCancel={() => {
          setIntegrationModalVisible(false);
          integrationForm.resetFields();
          setEditingIntegration(null);
        }}
        onOk={() => integrationForm.submit()}
        confirmLoading={createIntegrationMutation.isPending || updateIntegrationMutation.isPending}
        width={600}
      >
        <Form
          form={integrationForm}
          layout="vertical"
          onFinish={handleIntegrationSubmit}
          key={editingIntegration?.id || 'new'}
        >
          <Form.Item
            name="name"
            label={t('form.labels.integrationName')}
            rules={[{ required: true, message: t('form.validation.nameRequired') }]}
          >
            <Input placeholder={t('form.placeholders.integrationName')} />
          </Form.Item>

          <Form.Item
            name="device_type"
            label={t('form.labels.deviceType')}
            rules={[{ required: true, message: t('form.validation.deviceTypeRequired') }]}
          >
            <Select placeholder={t('form.placeholders.deviceType')}>
              <Select.Option value="exigo_eos_vet">
                {t('deviceTypes.exigoEosVet')} <Tag color="blue" style={{ marginLeft: 8 }}>{t('connectionTypes.fileWatch')}</Tag>
              </Select.Option>
              <Select.Option value="healvet_hv_fia3000">
                {t('deviceTypes.healvetHvFia3000')} <Tag color="green" style={{ marginLeft: 8 }}>{t('connectionTypes.serialPort')}</Tag>
              </Select.Option>
              <Select.Option value="mnchip_pointcare_pcr_v1">
                {t('deviceTypes.mnchipPointcarePcrV1')} <Tag color="blue" style={{ marginLeft: 8 }}>{t('connectionTypes.fileWatch')}</Tag> <Tag color="green" style={{ marginLeft: 4 }}>{t('connectionTypes.serialPort')}</Tag>
              </Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.device_type !== currentValues.device_type}
          >
            {({ getFieldValue, setFieldsValue }) => {
              const deviceType = getFieldValue('device_type');
              const currentConnectionType = getFieldValue('connection_type');
              const availableTypes = getConnectionTypesForDevice(deviceType);

              // Reset connection type if it's no longer valid for the selected device
              if (currentConnectionType && !availableTypes.includes(currentConnectionType)) {
                setTimeout(() => setFieldsValue({ connection_type: undefined }), 0);
              }

              return (
                <Form.Item
                  name="connection_type"
                  label={t('form.labels.connectionType')}
                  rules={[{ required: true, message: t('form.validation.connectionTypeRequired') }]}
                >
                  <Select placeholder={t('form.placeholders.connectionType')}>
                    {availableTypes.includes('file_watch') && (
                      <Select.Option value="file_watch">{t('connectionTypes.fileWatch')}</Select.Option>
                    )}
                    {availableTypes.includes('serial_port') && (
                      <Select.Option value="serial_port">{t('connectionTypes.serialPort')}</Select.Option>
                    )}
                    {availableTypes.includes('hl7_tcp') && (
                      <Select.Option value="hl7_tcp">{t('connectionTypes.hl7Tcp')}</Select.Option>
                    )}
                  </Select>
                </Form.Item>
              );
            }}
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.connection_type !== currentValues.connection_type}
          >
            {({ getFieldValue }) => {
              const connectionType = getFieldValue('connection_type');

              if (connectionType === 'file_watch') {
                return (
                  <>
                    <Form.Item
                      name="watch_directory"
                      label={t('form.labels.watchDirectory')}
                      rules={[{ required: true, message: t('form.validation.directoryRequired') }]}
                    >
                      <Input
                        placeholder={t('form.placeholders.watchDirectory')}
                        readOnly
                        addonAfter={
                          <Button
                            icon={<FolderOpenOutlined />}
                            onClick={handleSelectFolder}
                            type="text"
                            size="small"
                          >
                            {t('buttons.browse')}
                          </Button>
                        }
                      />
                    </Form.Item>
                    <Form.Item
                      name="file_pattern"
                      label={t('form.labels.filePattern')}
                    >
                      <Input placeholder={t('form.placeholders.filePattern')} />
                    </Form.Item>
                  </>
                );
              } else if (connectionType === 'serial_port') {
                return (
                  <Form.Item
                    name="serial_port_name"
                    label={t('form.labels.serialPort')}
                    rules={[{ required: true, message: t('form.validation.serialPortRequired') }]}
                  >
                    <AutoComplete
                      placeholder={t('form.placeholders.serialPort')}
                      options={ports.map(port => {
                        const details = getPortDetails(port.port_type);
                        const typeInfo = getPortTypeDisplay(port.port_type);
                        return {
                          value: port.port_name,
                          label: (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>
                                <strong>{port.port_name}</strong>
                                {details && <Text type="secondary" style={{ marginLeft: 8, fontSize: '0.85em' }}>{details}</Text>}
                              </span>
                              <Tag color={typeInfo.color} style={{ marginLeft: 8 }}>{typeInfo.text}</Tag>
                            </div>
                          ),
                        };
                      })}
                      filterOption={(inputValue, option) =>
                        option?.value.toLowerCase().includes(inputValue.toLowerCase()) ?? false
                      }
                      notFoundContent={
                        <div style={{ padding: '8px', textAlign: 'center' }}>
                          <Text type="secondary">{t('messages.noPortsFound')}</Text>
                        </div>
                      }
                    />
                  </Form.Item>
                );
              } else if (connectionType === 'hl7_tcp') {
                return (
                  <>
                    <Form.Item
                      name="tcp_host"
                      label={t('form.labels.tcpHost')}
                      rules={[{ required: true, message: t('form.validation.tcpHostRequired') }]}
                    >
                      <Input placeholder={t('form.placeholders.tcpHost')} />
                    </Form.Item>
                    <Form.Item
                      name="tcp_port"
                      label={t('form.labels.tcpPort')}
                      rules={[{ required: true, message: t('form.validation.tcpPortRequired') }]}
                    >
                      <InputNumber
                        min={1}
                        max={65535}
                        placeholder={t('form.placeholders.tcpPort')}
                        style={{ width: '100%' }}
                      />
                    </Form.Item>
                  </>
                );
              }
              return null;
            }}
          </Form.Item>

          {editingIntegration && (
            <Form.Item
              name="enabled"
              label={t('form.labels.enabled')}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default DeviceInputSettings;
