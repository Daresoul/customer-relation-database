import React, { useState, useEffect } from 'react';
import { Card, Form, Switch, Button, Typography, Alert, Space } from 'antd';
import { CalendarOutlined, GoogleOutlined, LinkOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../../utils/themeStyles';
import { invoke } from '@tauri-apps/api';
import { notify } from '../../../services/notifications';
import styles from '../Settings.module.css';

const { Text, Paragraph } = Typography;

interface AppointmentsSettingsProps {
  isUpdating: boolean;
}

interface GoogleCalendarSettings {
  connected: boolean;
  connected_email?: string;
  calendar_id?: string;
  sync_enabled: boolean;
  last_sync?: string;
}

const AppointmentsSettings: React.FC<AppointmentsSettingsProps> = ({ isUpdating }) => {
  const { t } = useTranslation(['common', 'forms']);
  const themeColors = useThemeColors();
  const [settings, setSettings] = useState<GoogleCalendarSettings>({
    connected: false,
    sync_enabled: false,
  });
  const [loading, setLoading] = useState(false);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      console.log('Loading Google Calendar settings...');
      const result = await invoke<GoogleCalendarSettings>('get_google_calendar_settings');
      console.log('Settings loaded:', result);
      setSettings(result);
    } catch (error) {
      console.error('Failed to load Google Calendar settings:', error);
    }
  };

  const handleConnectGoogle = async () => {
    try {
      setLoading(true);

      // Start OAuth flow
      console.log('Starting OAuth flow...');
      await invoke('start_oauth_flow');

      notify.info(
        'Google Authorization',
        'Opening browser for Google authorization...',
        { duration: 4 }
      );

      // Poll for OAuth callback completion
      const maxAttempts = 120; // Poll for up to 2 minutes
      let attempts = 0;

      const pollInterval = setInterval(async () => {
        attempts++;
        console.log(`Polling for OAuth callback... attempt ${attempts}/${maxAttempts}`);

        try {
          const callback = await invoke<[string, string] | null>('check_oauth_callback');
          console.log('Callback result:', callback);

          if (callback) {
            // Callback received! Complete the OAuth flow
            console.log('Callback received! Completing OAuth flow...');
            clearInterval(pollInterval);

            const [code, state] = callback;
            console.log('Exchanging code for tokens...');
            await invoke('complete_oauth_flow', { code, state });

            // Reload settings
            console.log('Reloading settings...');
            await loadSettings();

            notify.success(
              'Connected to Google Calendar',
              'Your Google Calendar has been successfully connected. Appointments will now sync automatically.',
              { duration: 8 }
            );
            setLoading(false);
          } else if (attempts >= maxAttempts) {
            // Timeout
            console.warn('OAuth flow timed out after', maxAttempts, 'attempts');
            clearInterval(pollInterval);
            notify.warning(
              'Authorization Timeout',
              'The authorization process timed out after 2 minutes. Please try again.',
              { duration: 10 }
            );
            setLoading(false);
          }
        } catch (error) {
          console.error('OAuth polling error:', error);
          clearInterval(pollInterval);
          notify.error(
            'OAuth Error',
            `Failed to complete OAuth authorization: ${error}`,
            { duration: 12 }
          );
          setLoading(false);
        }
      }, 1000); // Poll every second

    } catch (error) {
      console.error('Failed to start OAuth flow:', error);
      notify.error(
        'Failed to Start OAuth',
        `Could not initiate Google authorization: ${error}`,
        { duration: 12 }
      );
      setLoading(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    try {
      setLoading(true);
      await invoke('disconnect_google_calendar');
      await loadSettings();
      notify.success(
        'Disconnected from Google Calendar',
        'Your Google Calendar has been disconnected. Appointments will no longer sync.',
        { duration: 6 }
      );
    } catch (error) {
      notify.error(
        'Disconnect Failed',
        `Failed to disconnect from Google Calendar: ${error}`,
        { duration: 10 }
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSyncToggle = async (enabled: boolean) => {
    try {
      console.log('Toggling sync to:', enabled);
      await invoke('update_sync_enabled', { enabled });
      await loadSettings();

      if (enabled) {
        notify.success(
          'Sync Enabled',
          'Syncing existing appointments to Google Calendar...',
          { duration: 4 }
        );

        // Trigger initial sync of existing appointments
        try {
          await invoke('trigger_manual_sync');
          notify.success(
            'Initial Sync Complete',
            'All future appointments have been synced to Google Calendar.',
            { duration: 6 }
          );
        } catch (syncError) {
          notify.warning(
            'Initial Sync Failed',
            `Sync enabled but initial sync failed: ${syncError}. You can manually sync using the "Sync Now" button.`,
            { duration: 10 }
          );
        }
      } else {
        notify.info(
          'Sync Disabled',
          'Appointments will no longer sync with Google Calendar.',
          { duration: 4 }
        );
      }
    } catch (error) {
      notify.error(
        'Failed to Update Sync Setting',
        `Could not update sync setting: ${error}`,
        { duration: 8 }
      );
      // Reload settings to revert the UI
      await loadSettings();
    }
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
          <Switch
            disabled={isUpdating || !settings.connected}
            checked={settings.sync_enabled}
            onChange={handleSyncToggle}
          />
        </Form.Item>

        <Space direction="vertical" className={styles.fullWidth}>
          <Paragraph className={styles.connectionStatus}>
            <strong>Connection Status:</strong>{' '}
            {settings.connected ? (
              <>
                <span className={styles.statusConnected}>Connected</span>
                {settings.connected_email && <> ({settings.connected_email})</>}
              </>
            ) : (
              <span className={styles.statusDisconnected}>Not Connected</span>
            )}
          </Paragraph>

          <Space>
            {!settings.connected ? (
              <Button
                type="primary"
                icon={<GoogleOutlined />}
                onClick={handleConnectGoogle}
                disabled={isUpdating || loading}
                loading={loading}
              >
                Connect Google Calendar
              </Button>
            ) : (
              <>
                <Button
                  type="default"
                  onClick={async () => {
                    try {
                      setLoading(true);
                      await invoke('trigger_manual_sync');
                      notify.success('Manual Sync Started', 'Syncing appointments to Google Calendar...');
                    } catch (error) {
                      notify.error('Sync Failed', `${error}`);
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={isUpdating || loading}
                  loading={loading}
                >
                  Sync Now
                </Button>
                <Button
                  danger
                  icon={<LinkOutlined />}
                  onClick={handleDisconnectGoogle}
                  disabled={isUpdating || loading}
                  loading={loading}
                >
                  Disconnect
                </Button>
              </>
            )}
          </Space>
        </Space>
      </Card>
    </div>
  );
};

export default AppointmentsSettings;