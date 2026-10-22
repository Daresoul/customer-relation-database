import React from 'react';
import { Tooltip, Typography } from 'antd';
import { SettingOutlined, FolderOutlined, UsbOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDeviceIntegrations, useDeviceConnectionStatus, useFileWatcherStatus } from '../../hooks/useDeviceIntegrations';
import { ConnectionState, FileWatcherState, getDeviceTypeDisplayName } from '../../types/deviceIntegration';
import { describeFolderStatus, describeSerialStatus, formatLastResult } from './deviceHealth';
import { HealthLines } from './HealthLines';
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
    (i) => i.connectionType === 'serial_port' && i.enabled
  ) || [];

  const fileWatchIntegrations = integrations?.filter(
    (i) => i.connectionType === 'file_watch' && i.enabled
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

  return (
    <div className={styles.inlineStatus}>
      {hasIntegrations && (
        <div className={styles.deviceList}>
          {/* Serial Port Integrations */}
          {serialPortIntegrations.map((integration) => {
          const status = getSerialStatus(integration.id);
          const statusColor = getSerialStatusColor(status?.status);
          const lastResult = formatLastResult(status?.last_result_at, new Date(), t);

          return (
            <Tooltip
              key={integration.id}
              title={
                <div>
                  <div><strong>{integration.name}</strong></div>
                  <div>{getDeviceTypeDisplayName(integration.deviceType as any)}</div>
                  <div>{t('tooltips.port', { port: integration.serialPortName })}</div>
                  <HealthLines health={describeSerialStatus(status, t)} lastResult={lastResult} />
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
                {lastResult && <Text type="secondary" className={styles.lastResult}>{lastResult}</Text>}
              </div>
            </Tooltip>
          );
        })}

        {/* File Watcher Integrations */}
        {fileWatchIntegrations.map((integration) => {
          const status = getFileWatcherStatus(integration.id);
          const statusColor = getFileWatcherStatusColor(status?.status);
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
                  <HealthLines health={describeFolderStatus(status, t)} lastResult={lastResult} />
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
                {lastResult && <Text type="secondary" className={styles.lastResult}>{lastResult}</Text>}
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
