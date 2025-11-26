import React from 'react';
import { Space, Tooltip, Typography } from 'antd';
import { ApiOutlined, SettingOutlined, FolderOutlined, UsbOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDeviceIntegrations, useDeviceConnectionStatus, useFileWatcherStatus } from '../../hooks/useDeviceIntegrations';
import { ConnectionState, FileWatcherState, getDeviceTypeDisplayName } from '../../types/deviceIntegration';
import styles from './DeviceStatusBar.module.css';

const { Text } = Typography;

export const DeviceStatusBar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Only show on main dashboard
  const isMainDashboard = location.pathname === '/';
  const { data: integrations, isLoading } = useDeviceIntegrations();
  const { getStatus: getSerialStatus } = useDeviceConnectionStatus();
  const { getStatus: getFileWatcherStatus } = useFileWatcherStatus();

  // Get enabled integrations by type
  const serialPortIntegrations = integrations?.filter(
    (i) => i.connection_type === 'serial_port' && i.enabled
  ) || [];

  const fileWatchIntegrations = integrations?.filter(
    (i) => i.connection_type === 'file_watch' && i.enabled
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
        return 'Connected';
      case 'Connecting':
        return `Connecting${retryCount ? ` (attempt ${retryCount + 1})` : '...'}`;
      case 'Disconnected':
        return 'Disconnected - retrying...';
      case 'Error':
        return `Error: ${lastError || 'Unknown'} - retrying...`;
      default:
        return 'Unknown';
    }
  };

  const getFileWatcherStatusText = (state?: FileWatcherState, lastError?: string): string => {
    switch (state) {
      case 'Watching':
        return 'Watching for files';
      case 'Error':
        return `Error: ${lastError || 'Unknown'}`;
      case 'Stopped':
        return 'Stopped';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className={styles.statusBar}>
      <div className={styles.statusBarContent}>
        <ApiOutlined className={styles.icon} />
        <Text className={styles.label}>Devices:</Text>
        <Space size="middle" className={styles.deviceList}>
          {/* Serial Port Integrations */}
          {serialPortIntegrations.map((integration) => {
            const status = getSerialStatus(integration.id);
            const statusColor = getSerialStatusColor(status?.status);
            const statusText = getSerialStatusText(status?.status, status?.retry_count, status?.last_error);

            return (
              <Tooltip
                key={integration.id}
                title={
                  <div>
                    <div><strong>{integration.name}</strong></div>
                    <div>{getDeviceTypeDisplayName(integration.device_type)}</div>
                    <div>Port: {integration.serial_port_name}</div>
                    <div>Status: {statusText}</div>
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
                    <div>{getDeviceTypeDisplayName(integration.device_type)}</div>
                    <div>Directory: {integration.watch_directory}</div>
                    <div>Pattern: {integration.file_pattern}</div>
                    <div>Status: {statusText}</div>
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
        <Tooltip title="Device Settings">
          <SettingOutlined
            className={styles.settingsIcon}
            onClick={() => navigate('/settings')}
          />
        </Tooltip>
      </div>
    </div>
  );
};

export default DeviceStatusBar;
