import React from 'react';
import { Card, Form, Switch, Button, Typography, Alert, Space } from 'antd';
import { CalendarOutlined, GoogleOutlined, LinkOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../../utils/themeStyles';

const { Text, Paragraph } = Typography;

interface AppointmentsSettingsProps {
  form: any;
  isUpdating: boolean;
}

const AppointmentsSettings: React.FC<AppointmentsSettingsProps> = ({ form, isUpdating }) => {
  const { t } = useTranslation(['common', 'forms']);
  const themeColors = useThemeColors();

  const handleConnectGoogle = () => {
    // TODO: Implement Google OAuth flow
  };

  const handleDisconnectGoogle = () => {
    // TODO: Implement disconnect logic
  };

  return (
    <div>
      <Card
        title={
          <span style={{ color: themeColors.text }}>
            <CalendarOutlined /> Google Calendar Integration
          </span>
        }
        style={{
          marginBottom: 16,
          background: themeColors.cardBg,
          borderColor: themeColors.border
        }}
      >
        <Alert
          message="Google Calendar Sync"
          description="Connect your Google Calendar to automatically sync appointments between your veterinary clinic and Google Calendar. This allows you to view and manage appointments from both systems."
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />

        <Form.Item
          name="googleCalendarSync"
          label={<span style={{ color: themeColors.text }}>Enable Google Calendar Sync</span>}
          extra={<span style={{ color: themeColors.textSecondary }}>Two-way sync between clinic appointments and Google Calendar</span>}
          valuePropName="checked"
        >
          <Switch disabled={isUpdating} />
        </Form.Item>

        <Space direction="vertical" style={{ width: '100%' }}>
          <Paragraph style={{ color: themeColors.text }}>
            <strong>Connection Status:</strong> <span style={{ color: '#ff4d4f' }}>Not Connected</span>
          </Paragraph>

          <Space>
            <Button
              type="primary"
              icon={<GoogleOutlined />}
              onClick={handleConnectGoogle}
              disabled={isUpdating}
            >
              Connect Google Calendar
            </Button>
            <Button
              danger
              icon={<LinkOutlined />}
              onClick={handleDisconnectGoogle}
              disabled={isUpdating}
              style={{ display: 'none' }} // Show only when connected
            >
              Disconnect
            </Button>
          </Space>
        </Space>
      </Card>
    </div>
  );
};

export default AppointmentsSettings;