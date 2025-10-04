/**
 * UpdateSettings Component
 * Feature: Auto-Update System
 * Displays update preferences and manual update check in Settings page
 */

import React, { useState, useEffect } from 'react';
import { Form, Switch, Button, Typography, Space, message } from 'antd';
import { updateService } from '../../services/updateService';
import { useUpdater } from '../../hooks/useUpdater';

const { Text } = Typography;

export function UpdateSettings() {
  const [autoCheckEnabled, setAutoCheckEnabled] = useState(true);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const { checkForUpdates, status } = useUpdater();

  // Load preferences on mount
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
        message.error('Failed to load update settings');
      }
    }

    loadPreferences();
  }, []);

  /**
   * Toggle automatic update checking
   */
  const handleToggleAutoCheck = async (checked: boolean) => {
    try {
      setLoading(true);
      await updateService.setAutoCheckEnabled(checked);
      setAutoCheckEnabled(checked);
      message.success('Update settings saved');
    } catch (error) {
      console.error('Failed to save update settings:', error);
      message.error('Failed to save settings');
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
      await checkForUpdates();

      if (status === 'idle') {
        message.success('You are up to date!');
      }

      // Update last check timestamp
      const prefs = await updateService.getPreferences();
      if (prefs.lastCheckTimestamp) {
        setLastCheck(new Date(prefs.lastCheckTimestamp * 1000));
      }
    } catch (error) {
      console.error('Update check failed:', error);
      message.error('Update check failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
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

      <Button onClick={handleManualCheck} loading={loading || status === 'checking'}>
        Check for Updates Now
      </Button>
    </Space>
  );
}
