import React from 'react';
import { Tooltip, Typography } from 'antd';
import { SettingOutlined, FolderOutlined, UsbOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDeviceIntegrations, useDeviceConnectionStatus, useFileWatcherStatus } from '../../hooks/useDeviceIntegrations';
import { ConnectionState, FileWatcherState, getDeviceTypeDisplayName } from '../../types/deviceIntegration';
import styles from './DeviceStatusInline.module.css';

const { Text } = Typography;

export const DeviceStatusInline: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('devices');
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

  // Show loading state or empty state with settings icon
  if (isLoading) {
    return null;
  }

  const hasIntegrations = serialPortIntegrations.length > 0 || fileWatchIntegrations.length > 0;

  const getSerialStatusColor = (state?: ConnectionState): string => {
    switch (state) {
      case 'Connected':
        return '#52c41a';
      case 'Connecting':
        return '#faad14';
      case 'Disconnected':
      case 'Error':
        return '#ff4d4f';
      default:
        return '#d9d9d9';
    }
  };

  const getFileWatcherStatusColor = (state?: FileWatcherState): string => {
    switch (state) {
      case 'Watching':
        return '#52c41a';
      case 'Error':
        return '#ff4d4f';
      case 'Stopped':
        return '#d9d9d9';
      default:
        return '#d9d9d9';
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
    <div className={styles.inlineStatus}>
      {hasIntegrations && (
        <div className={styles.deviceList}>
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
                  <div>{t('tooltips.port', { port: integration.serial_port_name })}</div>
                  <div>{t('tooltips.status', { status: statusText })}</div>
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
                  <div>{t('tooltips.directory', { directory: integration.watch_directory })}</div>
                  <div>{t('tooltips.pattern', { pattern: integration.file_pattern })}</div>
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
        </div>
      )}
      <Tooltip title={t('tooltips.deviceSettings')}>
        <SettingOutlined
          className={styles.settingsIcon}
          onClick={() => navigate('/settings')}
        />
      </Tooltip>
    </div>
  );
};

export default DeviceStatusInline;
