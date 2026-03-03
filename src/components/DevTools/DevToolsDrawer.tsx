/**
 * DevToolsDrawer - Development tools panel for device simulation
 * Only available in dev mode (npm run tauri dev)
 */

import React, { useState, useEffect } from 'react';
import {
  Drawer,
  Collapse,
  Form,
  Input,
  InputNumber,
  Button,
  Space,
  Tag,
  Alert,
  Select,
  Divider,
  Typography,
  App,
  Switch,
  Tooltip,
} from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  SendOutlined,
  ThunderboltOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/tauri';
import styles from './DevTools.module.css';

const { Panel } = Collapse;
const { Text, Title } = Typography;
const { Option } = Select;

interface DevToolsDrawerProps {
  open: boolean;
  onClose: () => void;
}

interface VirtualPortStatus {
  running: boolean;
  platform: 'macos' | 'linux' | 'windows';
  ports: Array<{
    name: string;
    appPort: string;
    testPort: string;
    status: 'running' | 'stopped' | 'error';
  }>;
}

// Healvet test parameters
const HEALVET_PARAMS = [
  { code: 'T4-1', label: 'T4 (Thyroid)', unit: 'nmol/L', defaultValue: 25.3 },
  { code: 'TSH-1', label: 'TSH', unit: 'mIU/L', defaultValue: 0.15 },
  { code: 'Cortisol-1', label: 'Cortisol', unit: 'nmol/L', defaultValue: 85.0 },
  { code: 'cCRP', label: 'C-Reactive Protein', unit: 'mg/L', defaultValue: 5.2 },
  { code: 'D-Dimer', label: 'D-Dimer', unit: 'ng/mL', defaultValue: 120.0 },
  { code: 'SAA', label: 'Serum Amyloid A', unit: 'mg/L', defaultValue: 3.1 },
];

// PointCare test types
const POINTCARE_TEST_TYPES = [
  { value: 55, label: 'General Panel (55)' },
  { value: 61, label: 'Liver Panel (61)' },
  { value: 62, label: 'Kidney Panel (62)' },
  { value: 57, label: 'Electrolytes (57)' },
];

export const DevToolsDrawer: React.FC<DevToolsDrawerProps> = ({ open, onClose }) => {
  const { notification } = App.useApp();
  const [healvetForm] = Form.useForm();
  const [pointcareForm] = Form.useForm();
  const [pcrForm] = Form.useForm();

  const [virtualPortStatus, setVirtualPortStatus] = useState<VirtualPortStatus | null>(null);
  const [startingPorts, setStartingPorts] = useState(false);
  const [sendingHealvet, setSendingHealvet] = useState(false);
  const [sendingPointcare, setSendingPointcare] = useState(false);
  const [sendingPcr, setSendingPcr] = useState(false);

  // Check virtual port status on open
  useEffect(() => {
    if (open) {
      checkVirtualPortStatus();
    }
  }, [open]);

  const checkVirtualPortStatus = async () => {
    try {
      const status = await invoke<VirtualPortStatus>('get_virtual_port_status');
      setVirtualPortStatus(status);
    } catch (error) {
      console.error('Failed to get virtual port status:', error);
      // Set default status if command not implemented yet
      setVirtualPortStatus({
        running: false,
        platform: navigator.platform.toLowerCase().includes('win') ? 'windows' : 'macos',
        ports: [],
      });
    }
  };

  const handleStartVirtualPorts = async () => {
    setStartingPorts(true);
    try {
      await invoke('start_virtual_ports');
      notification.success({
        message: 'Virtual Ports Started',
        description: 'socat/com0com virtual ports are now running',
        placement: 'bottomRight',
      });
      await checkVirtualPortStatus();
    } catch (error: any) {
      notification.error({
        message: 'Failed to Start Virtual Ports',
        description: error?.message || String(error),
        placement: 'bottomRight',
      });
    } finally {
      setStartingPorts(false);
    }
  };

  const handleStopVirtualPorts = async () => {
    try {
      await invoke('stop_virtual_ports');
      notification.success({
        message: 'Virtual Ports Stopped',
        description: 'Virtual serial ports have been stopped',
        placement: 'bottomRight',
      });
      await checkVirtualPortStatus();
    } catch (error: any) {
      notification.error({
        message: 'Failed to Stop Virtual Ports',
        description: error?.message || String(error),
        placement: 'bottomRight',
      });
    }
  };

  const handleSendHealvet = async () => {
    setSendingHealvet(true);
    try {
      const values = await healvetForm.validateFields();
      await invoke('send_test_healvet', {
        patientId: values.patientId,
        params: HEALVET_PARAMS.map(p => ({
          code: p.code,
          value: values[p.code] ?? p.defaultValue,
        })),
      });
      notification.success({
        message: 'Healvet Data Sent',
        description: `Sent ${HEALVET_PARAMS.length} test results for ${values.patientId}`,
        placement: 'bottomRight',
      });
    } catch (error: any) {
      notification.error({
        message: 'Failed to Send Healvet Data',
        description: error?.message || String(error),
        placement: 'bottomRight',
      });
    } finally {
      setSendingHealvet(false);
    }
  };

  const handleSendPointcare = async () => {
    setSendingPointcare(true);
    try {
      const values = await pointcareForm.validateFields();
      await invoke('send_test_pointcare', {
        patientId: values.patientId,
        testType: values.testType,
      });
      notification.success({
        message: 'PointCare Data Sent',
        description: `Sent test type ${values.testType} for ${values.patientId}`,
        placement: 'bottomRight',
      });
    } catch (error: any) {
      notification.error({
        message: 'Failed to Send PointCare Data',
        description: error?.message || String(error),
        placement: 'bottomRight',
      });
    } finally {
      setSendingPointcare(false);
    }
  };

  const handleSendPcr = async () => {
    setSendingPcr(true);
    try {
      const values = await pcrForm.validateFields();
      await invoke('send_test_pcr', {
        patientId: values.patientId,
        positive: values.positive ?? false,
      });
      notification.success({
        message: 'PCR Data Sent',
        description: `Sent PCR result for ${values.patientId}`,
        placement: 'bottomRight',
      });
    } catch (error: any) {
      notification.error({
        message: 'Failed to Send PCR Data',
        description: error?.message || String(error),
        placement: 'bottomRight',
      });
    } finally {
      setSendingPcr(false);
    }
  };

  const handleDropExigoFile = async () => {
    try {
      await invoke('send_test_exigo');
      notification.success({
        message: 'Exigo XML Created',
        description: 'Test XML file dropped in watch directory',
        placement: 'bottomRight',
      });
    } catch (error: any) {
      notification.error({
        message: 'Failed to Create Exigo File',
        description: error?.message || String(error),
        placement: 'bottomRight',
      });
    }
  };

  return (
    <Drawer
      title={
        <Space>
          <ThunderboltOutlined style={{ color: '#faad14' }} />
          <span>Dev Tools - Device Simulator</span>
          <Tag color="orange">DEV ONLY</Tag>
        </Space>
      }
      placement="right"
      width={450}
      onClose={onClose}
      open={open}
      className={styles.devToolsDrawer}
    >
      {/* Virtual Ports Section */}
      <div className={styles.section}>
        <Title level={5}>Virtual Serial Ports</Title>
        <Text type="secondary">
          {virtualPortStatus?.platform === 'windows' ? 'com0com' : 'socat'} virtual port pairs
        </Text>

        <div className={styles.portStatus}>
          <Space>
            <Tag color={virtualPortStatus?.running ? 'green' : 'default'}>
              {virtualPortStatus?.running ? 'Running' : 'Stopped'}
            </Tag>
            {!virtualPortStatus?.running ? (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleStartVirtualPorts}
                loading={startingPorts}
                size="small"
              >
                Start
              </Button>
            ) : (
              <Button
                danger
                icon={<StopOutlined />}
                onClick={handleStopVirtualPorts}
                size="small"
              >
                Stop
              </Button>
            )}
            <Tooltip title="Refresh status">
              <Button
                icon={<ReloadOutlined />}
                onClick={checkVirtualPortStatus}
                size="small"
              />
            </Tooltip>
          </Space>
        </div>

        {!virtualPortStatus?.running && (
          <Alert
            message="Virtual ports not running"
            description="Start virtual ports to enable device simulation. Make sure socat (macOS/Linux) or com0com (Windows) is installed."
            type="warning"
            showIcon
            className={styles.alert}
          />
        )}

        {virtualPortStatus?.running && virtualPortStatus.ports.length > 0 && (
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 12 }}
            message="Configure your device integrations"
            description={
              <div style={{ fontSize: 12 }}>
                <div style={{ marginBottom: 8 }}>
                  Go to <Text strong>Settings → Device Integrations</Text> and set the serial port to:
                </div>
                {virtualPortStatus.ports.map(port => (
                  <div key={port.name} style={{ marginBottom: 4 }}>
                    <Text strong>{port.name}:</Text>
                    <Text code copyable style={{ marginLeft: 8, fontSize: 11 }}>{port.appPort}</Text>
                  </div>
                ))}
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary">Make sure the integration is enabled and listener is started.</Text>
                </div>
              </div>
            }
          />
        )}
      </div>

      <Divider />

      {/* Device Simulators */}
      <Collapse defaultActiveKey={['healvet']} ghost>
        {/* Healvet HV-FIA 3000 */}
        <Panel
          header={
            <Space>
              <span>Healvet HV-FIA 3000</span>
              <Tag>Serial</Tag>
            </Space>
          }
          key="healvet"
        >
          <Form
            form={healvetForm}
            layout="vertical"
            size="small"
            initialValues={{
              patientId: 'TESTDOG-001',
              ...Object.fromEntries(HEALVET_PARAMS.map(p => [p.code, p.defaultValue])),
            }}
          >
            <Form.Item name="patientId" label="Patient ID" rules={[{ required: true }]}>
              <Input placeholder="TESTDOG-001" />
            </Form.Item>

            {HEALVET_PARAMS.map(param => (
              <Form.Item
                key={param.code}
                name={param.code}
                label={`${param.label} (${param.unit})`}
              >
                <InputNumber
                  step={0.1}
                  precision={2}
                  style={{ width: '100%' }}
                  addonAfter={param.unit}
                />
              </Form.Item>
            ))}

            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSendHealvet}
              loading={sendingHealvet}
              disabled={!virtualPortStatus?.running}
              block
            >
              Send Healvet Panel
            </Button>
          </Form>
        </Panel>

        {/* MNCHIP PointCare */}
        <Panel
          header={
            <Space>
              <span>MNCHIP PointCare Chemistry</span>
              <Tag>Serial</Tag>
            </Space>
          }
          key="pointcare"
        >
          <Form
            form={pointcareForm}
            layout="vertical"
            size="small"
            initialValues={{
              patientId: 'TESTCAT-001',
              testType: 55,
            }}
          >
            <Form.Item name="patientId" label="Patient ID" rules={[{ required: true }]}>
              <Input placeholder="TESTCAT-001" />
            </Form.Item>

            <Form.Item name="testType" label="Test Type" rules={[{ required: true }]}>
              <Select>
                {POINTCARE_TEST_TYPES.map(t => (
                  <Option key={t.value} value={t.value}>{t.label}</Option>
                ))}
              </Select>
            </Form.Item>

            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSendPointcare}
              loading={sendingPointcare}
              disabled={!virtualPortStatus?.running}
              block
            >
              Send PointCare Results
            </Button>
          </Form>
        </Panel>

        {/* MNCHIP PCR */}
        <Panel
          header={
            <Space>
              <span>MNCHIP PCR Analyzer</span>
              <Tag>Serial</Tag>
            </Space>
          }
          key="pcr"
        >
          <Form
            form={pcrForm}
            layout="vertical"
            size="small"
            initialValues={{
              patientId: 'TESTBIRD-001',
              positive: false,
            }}
          >
            <Form.Item name="patientId" label="Patient ID" rules={[{ required: true }]}>
              <Input placeholder="TESTBIRD-001" />
            </Form.Item>

            <Form.Item name="positive" label="Result" valuePropName="checked">
              <Switch
                checkedChildren="Positive"
                unCheckedChildren="Negative"
              />
            </Form.Item>

            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSendPcr}
              loading={sendingPcr}
              disabled={!virtualPortStatus?.running}
              block
            >
              Send PCR Result
            </Button>
          </Form>
        </Panel>

        {/* Exigo (File Watch) */}
        <Panel
          header={
            <Space>
              <span>Exigo Eos Vet</span>
              <Tag color="blue">File Watch</Tag>
            </Space>
          }
          key="exigo"
        >
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            Drops a test XML file in the configured watch directory.
          </Text>

          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleDropExigoFile}
            block
          >
            Drop Test XML File
          </Button>
        </Panel>
      </Collapse>
    </Drawer>
  );
};

export default DevToolsDrawer;
