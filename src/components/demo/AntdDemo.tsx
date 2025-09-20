/**
 * Demo component to showcase Ant Design components with dark theme
 * This can be removed once the actual migration is complete
 */

import React from 'react';
import {
  Button,
  Space,
  Card,
  Typography,
  Alert,
  Tag,
  Divider,
  Input,
  Select,
  Table,
  Form,
  DatePicker,
  Switch,
  notification,
  message
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  HeartOutlined,
  UserOutlined,
  CalendarOutlined,
  SaveOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;
const { Option } = Select;

export const AntdDemo: React.FC = () => {
  const [messageApi, contextHolder] = message.useMessage();

  const handleNotification = () => {
    notification.success({
      message: 'Success',
      description: 'Dark theme is working beautifully!',
      placement: 'topRight',
    });
  };

  const handleMessage = () => {
    messageApi.success('Action completed successfully!');
  };

  const tableColumns = [
    {
      title: 'Patient Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Species',
      dataIndex: 'species',
      key: 'species',
      render: (species: string) => (
        <Tag color={species === 'dog' ? 'blue' : 'green'}>{species}</Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'active' ? 'success' : 'warning'}>{status}</Tag>
      ),
    },
  ];

  const tableData = [
    { key: '1', name: 'Max', species: 'dog', status: 'active' },
    { key: '2', name: 'Luna', species: 'cat', status: 'inactive' },
    { key: '3', name: 'Charlie', species: 'dog', status: 'active' },
  ];

  return (
    <>
      {contextHolder}
      <div style={{ padding: '24px', background: '#141414', minHeight: '100vh' }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Card>
            <Title level={2}>
              <HeartOutlined style={{ marginRight: 8 }} />
              Ant Design Dark Theme Demo
            </Title>
            <Text type="secondary">
              This demonstrates the dark theme configured for the veterinary clinic application
            </Text>
          </Card>

          <Card title="Buttons & Actions">
            <Space wrap>
              <Button type="primary" icon={<PlusOutlined />}>
                Create Patient
              </Button>
              <Button type="default" icon={<SearchOutlined />}>
                Search
              </Button>
              <Button type="primary" danger>
                Delete
              </Button>
              <Button type="dashed">
                Dashed Button
              </Button>
              <Button type="link">
                Link Button
              </Button>
            </Space>
          </Card>

          <Card title="Form Elements">
            <Form layout="vertical" style={{ maxWidth: 600 }}>
              <Form.Item label="Patient Name" required>
                <Input placeholder="Enter patient name" prefix={<UserOutlined />} />
              </Form.Item>

              <Form.Item label="Species" required>
                <Select placeholder="Select species" style={{ width: '100%' }}>
                  <Option value="dog">Dog</Option>
                  <Option value="cat">Cat</Option>
                  <Option value="bird">Bird</Option>
                  <Option value="rabbit">Rabbit</Option>
                </Select>
              </Form.Item>

              <Form.Item label="Appointment Date">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item label="Active Patient">
                <Switch defaultChecked />
              </Form.Item>

              <Form.Item>
                <Button type="primary" icon={<SaveOutlined />}>
                  Save Patient
                </Button>
              </Form.Item>
            </Form>
          </Card>

          <Card title="Notifications & Alerts">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Alert
                message="Success"
                description="Patient record has been saved successfully."
                type="success"
                showIcon
              />
              <Alert
                message="Information"
                description="Next appointment is scheduled for tomorrow."
                type="info"
                showIcon
              />
              <Alert
                message="Warning"
                description="Vaccination record is due for update."
                type="warning"
                showIcon
              />
              <Alert
                message="Error"
                description="Unable to save patient record. Please try again."
                type="error"
                showIcon
              />

              <Space>
                <Button onClick={handleNotification}>
                  Show Notification
                </Button>
                <Button onClick={handleMessage}>
                  Show Message
                </Button>
              </Space>
            </Space>
          </Card>

          <Card title="Status Tags">
            <Space wrap>
              <Tag color="success">Healthy</Tag>
              <Tag color="processing">Under Treatment</Tag>
              <Tag color="error">Critical</Tag>
              <Tag color="warning">Needs Attention</Tag>
              <Tag color="default">Inactive</Tag>
              <Tag color="blue">Scheduled</Tag>
              <Tag color="green">Recovered</Tag>
              <Tag color="red">Emergency</Tag>
            </Space>
          </Card>

          <Card title="Data Table">
            <Table
              columns={tableColumns}
              dataSource={tableData}
              pagination={false}
            />
          </Card>

          <Divider />

          <Text type="secondary" style={{ textAlign: 'center', display: 'block' }}>
            Dark theme optimized for extended use in medical settings
          </Text>
        </Space>
      </div>
    </>
  );
};