import React, { useState, useEffect, useCallback } from 'react';
import { Space, Tooltip, Typography, App } from 'antd';
import { ApiOutlined, SettingOutlined, FolderOutlined, UsbOutlined, ThunderboltOutlined, ReloadOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDeviceIntegrations, useDeviceConnectionStatus, useFileWatcherStatus } from '../../hooks/useDeviceIntegrations';
import { ConnectionState, FileWatcherState, getDeviceTypeDisplayName } from '../../types/deviceIntegration';
import { DevToolsDrawer } from '../DevTools';
import { describeFolderStatus, describeSerialStatus, formatLastResult } from './deviceHealth';
import { HealthLines } from './HealthLines';
import { useDeviceDrawer } from './useDeviceDrawer';
import styles from './DeviceStatusBar.module.css';

const { Text } = Typography;

export const DeviceStatusBar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('devices');
  const [devToolsOpen, setDevToolsOpen] = useState(false);
  const devToolsEnabled = import.meta.env.DEV;

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
  const { chipProps, drawer } = useDeviceDrawer();

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

  return (
    <div className={styles.statusBar}>
      <div className={styles.statusBarContent}>
        <ApiOutlined className={styles.icon} />
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
            const health = portMissing
              ? {
                  text: t('health.kinds.port_missing.title', { port: integration.serialPortName }),
                  action: t('health.kinds.port_missing.action', { port: integration.serialPortName }),
                  details: status?.last_error,
                }
              : describeSerialStatus(status, t);
            const lastResult = formatLastResult(status?.last_result_at, new Date(), t);

            return (
              <Tooltip
                key={integration.id}
                title={
                  <div>
                    <div><strong>{integration.name}</strong></div>
                    <div>{getDeviceTypeDisplayName(integration.deviceType as any)}</div>
                    <div>{t('tooltips.port', { port: integration.serialPortName })}</div>
                    <HealthLines health={health} lastResult={lastResult} />
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
                <div className={styles.deviceItem} {...chipProps(integration.id)}>
                  <UsbOutlined className={styles.typeIcon} />
                  <span
                    className={`${styles.statusDot} ${status?.status === 'Connecting' ? styles.pulsing : ''}`}
                    style={{ backgroundColor: statusColor }}
                  />
                  <Text className={styles.deviceName}>{integration.name}</Text>
                  {lastResult && <Text type="secondary" className={styles.lastResult}>{lastResult}</Text>}
                </div>
              </Tooltip>
            );
          })}

          {/* File Watcher Integrations */}
          {fileWatchIntegrations.map((integration) => {
            const status = getFileWatcherStatus(integration.id);
            const statusColor = getFileWatcherStatusColor(status?.status);
            const health = describeFolderStatus(status, t);
            const lastResult = formatLastResult(status?.last_result_at, new Date(), t);

            return (
              <Tooltip
                key={integration.id}
                title={
                  <div>
                    <div><strong>{integration.name}</strong></div>
                    <div>{getDeviceTypeDisplayName(integration.deviceType as any)}</div>
                    <div>{t('tooltips.directory', { directory: integration.watchDirectory })}</div>
                    <div>{t('tooltips.pattern', { pattern: integration.filePattern })}</div>
                    <HealthLines health={health} lastResult={lastResult} />
                  </div>
                }
              >
                <div className={styles.deviceItem} {...chipProps(integration.id)}>
                  <FolderOutlined className={styles.typeIcon} />
                  <span
                    className={styles.statusDot}
                    style={{ backgroundColor: statusColor }}
                  />
                  <Text className={styles.deviceName}>{integration.name}</Text>
                  {lastResult && <Text type="secondary" className={styles.lastResult}>{lastResult}</Text>}
                </div>
              </Tooltip>
            );
          })}
        </Space>
        {/* Dev Tools Button - dev builds only */}
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

      {drawer}

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
