import React from 'react';
import { Card, Form, Switch, Button, Typography, Alert, Space } from 'antd';
import { CalendarOutlined, GoogleOutlined, LinkOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../../utils/themeStyles';
import styles from '../Settings.module.css';

const { Text, Paragraph } = Typography;

interface AppointmentsSettingsProps {
  isUpdating: boolean;
}

const AppointmentsSettings: React.FC<AppointmentsSettingsProps> = ({ isUpdating }) => {
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
          <span className={styles.cardTitle}>
            <CalendarOutlined /> Google Calendar Integration
          </span>
        }
        className={styles.appointmentsCard}
      >
        <Alert
          message="Google Calendar Sync"
          description="Connect your Google Calendar to automatically sync appointments between your veterinary clinic and Google Calendar. This allows you to view and manage appointments from both systems."
          type="info"
          showIcon
          className={styles.alertBox}
        />

        <Form.Item
          name="googleCalendarSync"
          label={<span className={styles.formLabel}>Enable Google Calendar Sync</span>}
          extra={<span className={styles.formHint}>Two-way sync between clinic appointments and Google Calendar</span>}
          valuePropName="checked"
        >
          <Switch disabled={isUpdating} />
        </Form.Item>

        <Space direction="vertical" className={styles.fullWidth}>
          <Paragraph className={styles.connectionStatus}>
            <strong>Connection Status:</strong> <span className={styles.statusDisconnected}>Not Connected</span>
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
              className={styles.disconnectButton} // Show only when connected
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