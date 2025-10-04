/**
 * UpdateSettings Component
 * Feature: Auto-Update System
 * Displays update preferences and manual update check in Settings page
 */

import React, { useState, useEffect } from 'react';
import { Form, Switch, Button, Typography, Space, App } from 'antd';
import { getVersion } from '@tauri-apps/api/app';
import { updateService } from '../../services/updateService';
import { useUpdater } from '../../hooks/useUpdater';

const { Text } = Typography;

export function UpdateSettings() {
  const { message, notification } = App.useApp();
  const [autoCheckEnabled, setAutoCheckEnabled] = useState(true);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const { checkForUpdates, status } = useUpdater();

  // Load preferences and version on mount
  useEffect(() => {
    async function loadPreferences() {
      try {
        const prefs = await updateService.getPreferences();
        setAutoCheckEnabled(prefs.autoCheckEnabled);

        if (prefs.lastCheckTimestamp) {
          setLastCheck(new Date(prefs.lastCheckTimestamp * 1000));
        }
      } catch (error) {
        console.error('Failed to load update preferences:', error);
        notification.error({
        message: 'Error',
        description: 'Failed to load update settings',
        placement: 'bottomRight',
        duration: 5,
      });
      }
    }

    async function loadVersion() {
      try {
        const version = await getVersion();
        setCurrentVersion(version);
      } catch (error) {
        console.error('Failed to get app version:', error);
      }
    }

    loadPreferences();
    loadVersion();
  }, []);

  /**
   * Toggle automatic update checking
   */
  const handleToggleAutoCheck = async (checked: boolean) => {
    try {
      setLoading(true);
      await updateService.setAutoCheckEnabled(checked);
      setAutoCheckEnabled(checked);
      notification.success({
        message: 'Update settings saved',
        description: 'Update settings saved',
        placement: 'bottomRight',
        duration: 3,
      });
    } catch (error) {
      console.error('Failed to save update settings:', error);
      notification.error({
        message: 'Error',
        description: 'Failed to save settings',
        placement: 'bottomRight',
        duration: 5,
      });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Manually check for updates
   */
  const handleManualCheck = async () => {
    try {
      setLoading(true);
      const result = await updateService.checkForUpdates();

      if (result.shouldUpdate && result.manifest) {
        // Update available
        const description = result.manifest.notes
          ? result.manifest.notes.split('\n')[0]
          : 'A new version is available';

        notification.info({
          message: 'Update Available',
          description: `Version ${result.manifest.version}: ${description}`,
          placement: 'bottomRight',
          duration: 5,
        });

        // Record the check
        await updateService.recordCheck(result.manifest.version);
      } else {
        // Up to date
        notification.success({
          message: 'Up to Date',
          description: 'You are running the latest version!',
          placement: 'bottomRight',
          duration: 3,
        });

        // Record check without version
        await updateService.recordCheck();
      }

      // Update last check timestamp
      const prefs = await updateService.getPreferences();
      if (prefs.lastCheckTimestamp) {
        setLastCheck(new Date(prefs.lastCheckTimestamp * 1000));
      }
    } catch (error) {
      console.error('Update check failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      notification.error({
        message: 'Update Check Failed',
        description: `Error: ${errorMessage}`,
        placement: 'bottomRight',
        duration: 5,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {currentVersion && (
        <Text strong>Current Version: {currentVersion}</Text>
      )}

      <Form.Item label="Automatic Update Checks">
        <Switch
          checked={autoCheckEnabled}
          onChange={handleToggleAutoCheck}
          loading={loading}
        />
      </Form.Item>

      {lastCheck && (
        <Text type="secondary">Last checked: {lastCheck.toLocaleString()}</Text>
      )}

      <Button onClick={handleManualCheck} loading={loading || status === 'checking'} type="primary">
        Check for Updates
      </Button>
    </Space>
  );
}
