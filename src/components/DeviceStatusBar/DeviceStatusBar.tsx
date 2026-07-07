import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Space, Tooltip, Typography, App } from 'antd';
import { ApiOutlined, SettingOutlined, FolderOutlined, UsbOutlined, ThunderboltOutlined, ReloadOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDeviceIntegrations, useDeviceConnectionStatus, useFileWatcherStatus } from '../../hooks/useDeviceIntegrations';
import { ConnectionState, FileWatcherState, getDeviceTypeDisplayName } from '../../types/deviceIntegration';
import { DevToolsDrawer } from '../DevTools';
import isDev from '../../utils/isDev';
import styles from './DeviceStatusBar.module.css';

// Storage key for dev tools activation
const DEV_TOOLS_STORAGE_KEY = 'vet-clinic-dev-tools-enabled';

// Hook for hidden dev tools activation
function useHiddenDevTools() {
  const { notification } = App.useApp();
  const [enabled, setEnabled] = useState(() => {
    // Check localStorage on mount
    if (isDev) return true;
    try {
      return localStorage.getItem(DEV_TOOLS_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const clickCountRef = useRef(0);
  const lastClickTimeRef = useRef(0);

  // Handle secret click pattern (7 clicks within 3 seconds)
  const handleSecretClick = useCallback(() => {
    const now = Date.now();
    const timeSinceLastClick = now - lastClickTimeRef.current;

    if (timeSinceLastClick > 3000) {
      // Reset if more than 3 seconds since last click
      clickCountRef.current = 1;
    } else {
      clickCountRef.current += 1;
    }

    lastClickTimeRef.current = now;

    // Feedback at certain click counts
    if (clickCountRef.current === 4 && !enabled) {
      notification.info({
        message: '3 more clicks...',
        placement: 'bottomRight',
        duration: 1,
      });
    }

    if (clickCountRef.current >= 7) {
      clickCountRef.current = 0;
      const newState = !enabled;
      setEnabled(newState);

      try {
        if (newState) {
          localStorage.setItem(DEV_TOOLS_STORAGE_KEY, 'true');
          notification.success({
            message: 'Dev Tools Enabled',
            description: 'Developer tools are now available. Reload may be required for full functionality.',
            placement: 'bottomRight',
            duration: 4,
          });
        } else {
          localStorage.removeItem(DEV_TOOLS_STORAGE_KEY);
          notification.info({
            message: 'Dev Tools Disabled',
            description: 'Developer tools have been hidden.',
            placement: 'bottomRight',
            duration: 3,
          });
        }
      } catch (e) {
        console.error('Failed to save dev tools state:', e);
      }
    }
  }, [enabled, notification]);

  // Keyboard shortcut: Ctrl+Shift+Alt+D
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.altKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const newState = !enabled;
        setEnabled(newState);

        try {
          if (newState) {
            localStorage.setItem(DEV_TOOLS_STORAGE_KEY, 'true');
            notification.success({
              message: 'Dev Tools Enabled',
              description: 'Developer tools are now available.',
              placement: 'bottomRight',
              duration: 3,
            });
          } else {
            localStorage.removeItem(DEV_TOOLS_STORAGE_KEY);
            notification.info({
              message: 'Dev Tools Disabled',
              placement: 'bottomRight',
              duration: 2,
            });
          }
        } catch (e) {
          console.error('Failed to save dev tools state:', e);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, notification]);

  return { enabled: isDev || enabled, handleSecretClick };
}

const { Text } = Typography;

export const DeviceStatusBar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('devices');
  const [devToolsOpen, setDevToolsOpen] = useState(false);
  const { enabled: devToolsEnabled, handleSecretClick } = useHiddenDevTools();

  // Only show on main dashboard
  const isMainDashboard = location.pathname === '/';
  const { notification } = App.useApp();
  const { data: integrations, isLoading } = useDeviceIntegrations();
  const { getStatus: getSerialStatus, refetch: refetchSerialStatuses } = useDeviceConnectionStatus();
  const { getStatus: getFileWatcherStatus } = useFileWatcherStatus();

  // Names of serial ports currently present on the system. Used to detect when a
  // configured port has gone missing (e.g. a COM port that got renumbered), so we
  // can show "port not found" instead of a vague error.
  const [availablePorts, setAvailablePorts] = useState<string[] | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  const scanPorts = useCallback(async () => {
    try {
      const names = await invoke<string[]>('list_serial_port_names');
      setAvailablePorts(names);
    } catch {
      // Non-critical: leave as-is if the scan fails.
    }
  }, []);

  useEffect(() => {
    scanPorts();
  }, [scanPorts]);

  const handleReconnect = useCallback(async () => {
    if (reconnecting) return;
    setReconnecting(true);
    notification.info({
      message: t('notifications.reconnectStarted'),
      description: t('notifications.reconnectStartedDesc'),
      placement: 'bottomRight',
      duration: 2,
    });
    try {
      await invoke('reconnect_device_listeners');
      await Promise.all([scanPorts(), refetchSerialStatuses()]);
    } catch (e) {
      notification.warning({
        message: t('notifications.reconnectFailed'),
        description: String(e),
        placement: 'bottomRight',
      });
    } finally {
      setReconnecting(false);
    }
  }, [reconnecting, notification, t, scanPorts, refetchSerialStatuses]);

  // Get enabled integrations by type
  const serialPortIntegrations = integrations?.filter(
    (i) => i.connectionType === 'serial_port' && i.enabled
  ) || [];

  const fileWatchIntegrations = integrations?.filter(
    (i) => i.connectionType === 'file_watch' && i.enabled
  ) || [];

  // Don't render if no enabled integrations exist or not on main dashboard
  if (!isMainDashboard || isLoading || (serialPortIntegrations.length === 0 && fileWatchIntegrations.length === 0)) {
    return null;
  }

  const getSerialStatusColor = (state?: ConnectionState): string => {
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

  const getFileWatcherStatusColor = (state?: FileWatcherState): string => {
    switch (state) {
      case 'Watching':
        return '#52c41a'; // green
      case 'Error':
        return '#ff4d4f'; // red
      case 'Stopped':
        return '#d9d9d9'; // gray
      default:
        return '#d9d9d9'; // gray
    }
  };

  const getSerialStatusText = (state?: ConnectionState, retryCount?: number, lastError?: string): string => {
    switch (state) {
      case 'Connected':
        return t('status.connected');
      case 'Connecting':
        return retryCount ? t('status.connectingAttempt', { count: retryCount + 1 }) : t('status.connecting');
      case 'Disconnected':
        return t('status.disconnectedRetrying');
      case 'Error':
        return t('status.errorRetrying', { message: lastError || t('status.unknown') });
      default:
        return t('status.unknown');
    }
  };

  const getFileWatcherStatusText = (state?: FileWatcherState, lastError?: string): string => {
    switch (state) {
      case 'Watching':
        return t('status.watching');
      case 'Error':
        return t('status.errorWithMessage', { message: lastError || t('status.unknown') });
      case 'Stopped':
        return t('status.stopped');
      default:
        return t('status.unknown');
    }
  };

  return (
    <div className={styles.statusBar}>
      <div className={styles.statusBarContent}>
        <ApiOutlined className={styles.icon} onClick={handleSecretClick} style={{ cursor: 'pointer' }} />
        <Text className={styles.label}>{t('labels.devices')}</Text>
        <Space size="middle" className={styles.deviceList}>
          {/* Serial Port Integrations */}
          {serialPortIntegrations.map((integration) => {
            const status = getSerialStatus(integration.id);
            const isConnected = status?.status === 'Connected';
            // Only trust "port missing" once we have a successful scan and the device
            // isn't already connected (a connected device is obviously present).
            const portMissing =
              !isConnected &&
              !!integration.serialPortName &&
              availablePorts !== null &&
              !availablePorts.includes(integration.serialPortName);

            const statusColor = portMissing ? '#ff4d4f' : getSerialStatusColor(status?.status);
            const statusText = portMissing
              ? t('status.portNotFound', { port: integration.serialPortName })
              : getSerialStatusText(status?.status, status?.retry_count, status?.last_error);

            return (
              <Tooltip
                key={integration.id}
                title={
                  <div>
                    <div><strong>{integration.name}</strong></div>
                    <div>{getDeviceTypeDisplayName(integration.deviceType as any)}</div>
                    <div>{t('tooltips.port', { port: integration.serialPortName })}</div>
                    <div>{t('tooltips.status', { status: statusText })}</div>
                    {portMissing && (
                      <div>
                        {availablePorts && availablePorts.length > 0
                          ? t('tooltips.portNotFound', {
                              port: integration.serialPortName,
                              available: availablePorts.join(', '),
                            })
                          : t('tooltips.noPortsAvailable')}
                      </div>
                    )}
                  </div>
                }
              >
                <div className={styles.deviceItem}>
                  <UsbOutlined className={styles.typeIcon} />
                  <span
                    className={`${styles.statusDot} ${status?.status === 'Connecting' ? styles.pulsing : ''}`}
                    style={{ backgroundColor: statusColor }}
                  />
                  <Text className={styles.deviceName}>{integration.name}</Text>
                </div>
              </Tooltip>
            );
          })}

          {/* File Watcher Integrations */}
          {fileWatchIntegrations.map((integration) => {
            const status = getFileWatcherStatus(integration.id);
            const statusColor = getFileWatcherStatusColor(status?.status);
            const statusText = getFileWatcherStatusText(status?.status, status?.last_error);

            return (
              <Tooltip
                key={integration.id}
                title={
                  <div>
                    <div><strong>{integration.name}</strong></div>
                    <div>{getDeviceTypeDisplayName(integration.deviceType as any)}</div>
                    <div>{t('tooltips.directory', { directory: integration.watchDirectory })}</div>
                    <div>{t('tooltips.pattern', { pattern: integration.filePattern })}</div>
                    <div>{t('tooltips.status', { status: statusText })}</div>
                  </div>
                }
              >
                <div className={styles.deviceItem}>
                  <FolderOutlined className={styles.typeIcon} />
                  <span
                    className={styles.statusDot}
                    style={{ backgroundColor: statusColor }}
                  />
                  <Text className={styles.deviceName}>{integration.name}</Text>
                </div>
              </Tooltip>
            );
          })}
        </Space>
        {/* Dev Tools Button - Available in dev mode or when hidden activation is enabled */}
        {devToolsEnabled && (
          <Tooltip title="Dev Tools - Device Simulator">
            <div
              className={styles.devToolsButton}
              onClick={() => setDevToolsOpen(true)}
            >
              <ThunderboltOutlined className={styles.devToolsIcon} />
              <span className={styles.devToolsLabel}>DEV</span>
            </div>
          </Tooltip>
        )}

        <Tooltip title={t('tooltips.reconnect')}>
          <ReloadOutlined
            className={styles.settingsIcon}
            spin={reconnecting}
            onClick={reconnecting ? undefined : handleReconnect}
            style={{ cursor: reconnecting ? 'default' : 'pointer' }}
          />
        </Tooltip>

        <Tooltip title={t('tooltips.deviceSettings')}>
          <SettingOutlined
            className={styles.settingsIcon}
            onClick={() => navigate('/settings')}
          />
        </Tooltip>
      </div>

      {/* Dev Tools Drawer */}
      {devToolsEnabled && (
        <DevToolsDrawer
          open={devToolsOpen}
          onClose={() => setDevToolsOpen(false)}
        />
      )}
    </div>
  );
};

export default DeviceStatusBar;
