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
  const { t } = useTranslation(['common', 'forms', 'settings']);
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
        t('settings:googleCalendar.messages.googleAuthorization'),
        t('settings:googleCalendar.messages.openingBrowser'),
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
              t('settings:googleCalendar.messages.connectedSuccess'),
              t('settings:googleCalendar.messages.connectedDescription'),
              { duration: 8 }
            );
            setLoading(false);
          } else if (attempts >= maxAttempts) {
            // Timeout
            console.warn('OAuth flow timed out after', maxAttempts, 'attempts');
            clearInterval(pollInterval);
            notify.warning(
              t('settings:googleCalendar.messages.authTimeout'),
              t('settings:googleCalendar.messages.authTimeoutDescription'),
              { duration: 10 }
            );
            setLoading(false);
          }
        } catch (error) {
          console.error('OAuth polling error:', error);
          clearInterval(pollInterval);
          notify.error(
            t('settings:googleCalendar.messages.oauthError'),
            t('settings:googleCalendar.messages.oauthFailed', { error }),
            { duration: 12 }
          );
          setLoading(false);
        }
      }, 1000); // Poll every second

    } catch (error) {
      console.error('Failed to start OAuth flow:', error);
      notify.error(
        t('settings:googleCalendar.messages.failedToStart'),
        t('settings:googleCalendar.messages.failedToStartDescription', { error }),
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
        t('settings:googleCalendar.messages.disconnectedSuccess'),
        t('settings:googleCalendar.messages.disconnectedDescription'),
        { duration: 6 }
      );
    } catch (error) {
      notify.error(
        t('settings:googleCalendar.messages.disconnectFailed'),
        t('settings:googleCalendar.messages.disconnectFailedDescription', { error }),
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
          t('settings:googleCalendar.messages.syncEnabled'),
          t('settings:googleCalendar.messages.syncEnabledDescription'),
          { duration: 4 }
        );

        // Trigger initial sync of existing appointments
        try {
          await invoke('trigger_manual_sync');
          notify.success(
            t('settings:googleCalendar.messages.initialSyncComplete'),
            t('settings:googleCalendar.messages.initialSyncCompleteDescription'),
            { duration: 6 }
          );
        } catch (syncError) {
          notify.warning(
            t('settings:googleCalendar.messages.initialSyncFailed'),
            t('settings:googleCalendar.messages.initialSyncFailedDescription', { error: syncError }),
            { duration: 10 }
          );
        }
      } else {
        notify.info(
          t('settings:googleCalendar.messages.syncDisabled'),
          t('settings:googleCalendar.messages.syncDisabledDescription'),
          { duration: 4 }
        );
      }
    } catch (error) {
      notify.error(
        t('settings:googleCalendar.messages.updateSyncFailed'),
        t('settings:googleCalendar.messages.updateSyncFailedDescription', { error }),
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
            <CalendarOutlined /> {t('settings:googleCalendar.title')}
          </span>
        }
        className={styles.appointmentsCard}
      >
        <Alert
          message={t('settings:googleCalendar.syncTitle')}
          description={t('settings:googleCalendar.syncDescription')}
          type="info"
          showIcon
          className={styles.alertBox}
        />

        <Form.Item
          name="googleCalendarSync"
          label={<span className={styles.formLabel}>{t('settings:googleCalendar.enableSync')}</span>}
          extra={<span className={styles.formHint}>{t('settings:googleCalendar.syncHint')}</span>}
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
            <strong>{t('settings:googleCalendar.connectionStatus')}:</strong>{' '}
            {settings.connected ? (
              <>
                <span className={styles.statusConnected}>{t('settings:googleCalendar.connected')}</span>
                {settings.connected_email && <> ({settings.connected_email})</>}
              </>
            ) : (
              <span className={styles.statusDisconnected}>{t('settings:googleCalendar.notConnected')}</span>
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
                {t('settings:googleCalendar.connectButton')}
              </Button>
            ) : (
              <>
                <Button
                  type="default"
                  onClick={async () => {
                    try {
                      setLoading(true);
                      await invoke('trigger_manual_sync');
                      notify.success(t('settings:googleCalendar.messages.manualSyncStarted'), t('settings:googleCalendar.messages.manualSyncStartedDescription'));
                    } catch (error) {
                      notify.error(t('settings:googleCalendar.messages.syncFailed'), `${error}`);
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={isUpdating || loading}
                  loading={loading}
                >
                  {t('settings:googleCalendar.syncNowButton')}
                </Button>
                <Button
                  danger
                  icon={<LinkOutlined />}
                  onClick={handleDisconnectGoogle}
                  disabled={isUpdating || loading}
                  loading={loading}
                >
                  {t('settings:googleCalendar.disconnectButton')}
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