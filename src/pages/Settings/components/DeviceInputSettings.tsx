import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Typography, Space, Tag, Modal, Form, Input, Select, InputNumber, Switch, Popconfirm } from 'antd';
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
  useToggleDeviceIntegration
} from '../../../hooks/useDeviceIntegrations';
import {
  DeviceIntegration,
  DeviceType,
  ConnectionType,
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
  const { t } = useTranslation(['common']);
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

  const fetchPorts = async () => {
    setLoading(true);
    try {
      const result = await invoke<PortInfo[]>('get_available_ports');
      setPorts(result);
    } catch (error) {
      console.error('Failed to fetch ports:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPorts();
  }, []);

  const getPortTypeDisplay = (portType: PortType): { text: string; color: string } => {
    if (typeof portType === 'object' && 'SerialUSBPort' in portType) {
      return { text: 'Serial USB', color: 'blue' };
    }
    if (typeof portType === 'object' && 'HIDDevice' in portType) {
      return { text: 'HID', color: 'purple' };
    }
    if (portType === 'SerialPciPort') {
      return { text: 'Serial PCI', color: 'green' };
    }
    if (portType === 'SerialBluetoothPort') {
      return { text: 'Serial Bluetooth', color: 'cyan' };
    }
    return { text: 'Unknown', color: 'default' };
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
    setIntegrationModalVisible(true);
  };

  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Directory to Watch',
      });

      if (selected && typeof selected === 'string') {
        integrationForm.setFieldsValue({ watch_directory: selected });
      }
    } catch (error) {
      console.error('Error selecting folder:', error);
    }
  };

  // Get available connection types for a device
  const getConnectionTypesForDevice = (deviceType: DeviceType | undefined): ConnectionType[] => {
    if (!deviceType) return ['file_watch', 'serial_port', 'hl7_tcp'];

    switch (deviceType) {
      case 'exigo_eos_vet':
        return ['file_watch']; // Only supports file export
      case 'healvet_hv_fia_3000':
        return ['serial_port']; // Only supports serial communication
      case 'mnchip_pointcare_pcr_v1':
        return ['file_watch', 'serial_port']; // Supports both
      default:
        return ['file_watch', 'serial_port', 'hl7_tcp'];
    }
  };

  const handleEditIntegration = (integration: DeviceIntegration) => {
    setEditingIntegration(integration);
    integrationForm.setFieldsValue({
      name: integration.name,
      device_type: integration.device_type,
      connection_type: integration.connection_type,
      watch_directory: integration.watch_directory,
      file_pattern: integration.file_pattern,
      serial_port_name: integration.serial_port_name,
      serial_baud_rate: integration.serial_baud_rate,
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
    } catch (error) {
      console.error('Delete integration error:', error);
    }
  };

  const handleToggleIntegration = async (id: number) => {
    try {
      await toggleIntegrationMutation.mutateAsync(id);
      refetchIntegrations();
    } catch (error) {
      console.error('Toggle integration error:', error);
    }
  };

  const handleIntegrationSubmit = async (values: any) => {
    console.log('Form values:', values);
    console.log('editingIntegration:', editingIntegration);
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

      console.log('Integration data to send:', integrationData);

      if (editingIntegration) {
        console.log('Updating integration with ID:', editingIntegration.id);
        const updateData = { ...integrationData, enabled: values.enabled };
        console.log('Update data:', updateData);
        await updateIntegrationMutation.mutateAsync({
          id: editingIntegration.id,
          data: updateData,
        });
      } else {
        console.log('Creating new integration...');
        const result = await createIntegrationMutation.mutateAsync(integrationData);
        console.log('Create result:', result);
      }

      console.log('Success! Closing modal...');
      setIntegrationModalVisible(false);
      integrationForm.resetFields();
      setEditingIntegration(null);
      refetchIntegrations();
    } catch (error) {
      console.error('Save integration error:', error);
    }
  };

  // Device integrations table columns
  const integrationColumns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: DeviceIntegration) => (
        <Space>
          <Text strong>{text}</Text>
          {!record.enabled && <Tag color="default">Disabled</Tag>}
        </Space>
      ),
    },
    {
      title: 'Device',
      dataIndex: 'device_type',
      key: 'device_type',
      render: (deviceType: DeviceType) => (
        <Tag color="blue">{getDeviceTypeDisplayName(deviceType)}</Tag>
      ),
    },
    {
      title: 'Connection',
      dataIndex: 'connection_type',
      key: 'connection_type',
      render: (connectionType: ConnectionType) => (
        <Tag color="green">{getConnectionTypeDisplayName(connectionType)}</Tag>
      ),
    },
    {
      title: 'Configuration',
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
      title: 'Actions',
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
            {record.enabled ? 'Disable' : 'Enable'}
          </Button>
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => handleEditIntegration(record)}
          >
            Edit
          </Button>
          <Popconfirm
            title="Delete this device integration?"
            onConfirm={() => handleDeleteIntegration(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button
              icon={<DeleteOutlined />}
              size="small"
              danger
              loading={deleteIntegrationMutation.isPending}
            >
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const columns = [
    {
      title: 'Port Name',
      dataIndex: 'port_name',
      key: 'port_name',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: 'Type',
      dataIndex: 'port_type',
      key: 'type',
      render: (portType: PortType) => {
        const { text, color } = getPortTypeDisplay(portType);
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: 'Details',
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
              <UsbOutlined /> Available Input Devices
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
              Refresh
            </Button>
          }
        >
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <Text type="secondary">
              <ApiOutlined /> Detected {ports.length} device{ports.length !== 1 ? 's' : ''} (Serial Ports & HID Devices)
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
              <ApiOutlined /> Device Integrations
            </span>
          }
          className={styles.settingsCard}
          extra={
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAddIntegration}
            >
              Add Integration
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
        title={editingIntegration ? 'Edit Device Integration' : 'Add New Device Integration'}
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
            label="Integration Name"
            rules={[{ required: true, message: 'Please enter integration name' }]}
          >
            <Input placeholder="e.g., Lab Analyzer 1" />
          </Form.Item>

          <Form.Item
            name="device_type"
            label="Device Type"
            rules={[{ required: true, message: 'Please select device type' }]}
            extra="Connection type options will update based on device capabilities"
          >
            <Select placeholder="Select device type">
              <Select.Option value="exigo_eos_vet">
                Exigo Eos Vet <Tag color="blue" style={{ marginLeft: 8 }}>File Watch</Tag>
              </Select.Option>
              <Select.Option value="healvet_hv_fia_3000">
                Healvet HV-FIA 3000 <Tag color="green" style={{ marginLeft: 8 }}>Serial Port</Tag>
              </Select.Option>
              <Select.Option value="mnchip_pointcare_pcr_v1">
                MNCHIP PointCare PCR V1 <Tag color="blue" style={{ marginLeft: 8 }}>File Watch</Tag> <Tag color="green" style={{ marginLeft: 4 }}>Serial</Tag>
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
                  label="Connection Type"
                  rules={[{ required: true, message: 'Please select connection type' }]}
                >
                  <Select placeholder="Select connection type">
                    {availableTypes.includes('file_watch') && (
                      <Select.Option value="file_watch">File Watch</Select.Option>
                    )}
                    {availableTypes.includes('serial_port') && (
                      <Select.Option value="serial_port">Serial Port</Select.Option>
                    )}
                    {availableTypes.includes('hl7_tcp') && (
                      <Select.Option value="hl7_tcp">HL7 TCP</Select.Option>
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
                      label="Watch Directory"
                      rules={[{ required: true, message: 'Please select directory' }]}
                    >
                      <Input
                        placeholder="Select a directory to watch..."
                        readOnly
                        addonAfter={
                          <Button
                            icon={<FolderOpenOutlined />}
                            onClick={handleSelectFolder}
                            type="text"
                            size="small"
                          >
                            Browse
                          </Button>
                        }
                      />
                    </Form.Item>
                    <Form.Item
                      name="file_pattern"
                      label="File Pattern (Optional)"
                      extra="Glob pattern to match files (e.g., *.xml, result_*.csv)"
                    >
                      <Input placeholder="*.xml" />
                    </Form.Item>
                  </>
                );
              } else if (connectionType === 'serial_port') {
                return (
                  <>
                    <Form.Item
                      name="serial_port_name"
                      label="Serial Port"
                      rules={[{ required: true, message: 'Please enter serial port name' }]}
                    >
                      <Input placeholder="/dev/ttyUSB0 or COM1" />
                    </Form.Item>
                    <Form.Item
                      name="serial_baud_rate"
                      label="Baud Rate"
                      initialValue={9600}
                    >
                      <InputNumber
                        min={300}
                        max={115200}
                        placeholder="9600"
                        style={{ width: '100%' }}
                      />
                    </Form.Item>
                  </>
                );
              } else if (connectionType === 'hl7_tcp') {
                return (
                  <>
                    <Form.Item
                      name="tcp_host"
                      label="TCP Host"
                      rules={[{ required: true, message: 'Please enter TCP host' }]}
                    >
                      <Input placeholder="localhost or 192.168.1.100" />
                    </Form.Item>
                    <Form.Item
                      name="tcp_port"
                      label="TCP Port"
                      rules={[{ required: true, message: 'Please enter TCP port' }]}
                    >
                      <InputNumber
                        min={1}
                        max={65535}
                        placeholder="2575"
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
              label="Enabled"
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
