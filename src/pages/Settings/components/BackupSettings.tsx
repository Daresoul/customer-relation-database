/**
 * BackupSettings — choose a destination directory, view last-run status,
 * and trigger a manual backup. Backup also runs automatically on each
 * app startup if a destination is configured.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, Button, Typography, Space, App, Tag, Alert } from 'antd';
import { FolderOpenOutlined, SaveOutlined, ClockCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { invoke } from '@/services/invoke';
import { open as openDialog } from '@tauri-apps/api/dialog';
import { useTranslation } from 'react-i18next';
import { backupErrorText } from '@/utils/backupErrors';
import { formatDateTime } from '../../../utils/dateFormatter';
import { useQueryClient } from '@tanstack/react-query';
import { BACKUP_CONFIG_KEY } from '../../../components/AppHeader/backupHealth';

const { Text, Paragraph } = Typography;

interface BackupConfig {
  directory?: string;
  lastBackupAt?: string;
  lastError?: string;
}

const BackupSettings: React.FC = () => {
  const { t } = useTranslation(['settings', 'common']);
  const { notification } = App.useApp();
  // Async work reads the current t without re-running when the language changes.
  const tRef = useRef(t);
  tRef.current = t;
  const queryClient = useQueryClient();
  const [config, setConfigState] = useState<BackupConfig>({});
  // The header's backup light and warning read the same config.
  const setConfig = useCallback((c: BackupConfig) => {
    setConfigState(c);
    queryClient.setQueryData(BACKUP_CONFIG_KEY, c);
  }, [queryClient]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  const reload = useCallback(async () => {
    try {
      const c = await invoke<BackupConfig>('get_backup_config');
      setConfig(c || {});
    } catch (e) {
      const t = tRef.current;
      notification.error({
        message: t('common:error'),
        description: backupErrorText(e, t),
        placement: 'bottomRight',
      });
    }
  }, [notification, setConfig]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleChooseDirectory = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: t('settings:backups.chooseDirTitle', 'Choose a backup destination'),
        defaultPath: config.directory,
      });
      if (!selected || typeof selected !== 'string') return;
      setLoading(true);
      const updated = await invoke<BackupConfig>('set_backup_directory', { directory: selected });
      setConfig(updated);
      notification.success({
        message: t('common:success'),
        description: t('settings:backups.directorySaved', 'Backup destination saved'),
        placement: 'bottomRight',
      });
    } catch (e) {
      notification.error({
        message: t('common:error'),
        description: backupErrorText(e, t),
        placement: 'bottomRight',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBackupNow = async () => {
    setRunning(true);
    try {
      const updated = await invoke<BackupConfig>('run_backup_now');
      setConfig(updated);
      notification.success({
        message: t('common:success'),
        description: t('settings:backups.runSuccess', 'Backup completed'),
        placement: 'bottomRight',
      });
    } catch (e) {
      notification.error({
        message: t('common:error'),
        description: backupErrorText(e, t),
        placement: 'bottomRight',
      });
      reload();
    } finally {
      setRunning(false);
    }
  };

  const lastRunDisplay = config.lastBackupAt
    ? formatDateTime(config.lastBackupAt)
    : t('settings:backups.never', 'Never');

  return (
    <Card title={t('settings:backups.title', 'Backups')}>
      <Paragraph>
        {t(
          'settings:backups.description',
          'The application snapshots the database (one per day, kept for 30 days) and mirrors stored files to the destination you choose. A backup runs automatically each time the app starts.'
        )}
      </Paragraph>

      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div>
          <Text strong>{t('settings:backups.destination', 'Destination')}: </Text>
          {config.directory ? (
            <Text code>{config.directory}</Text>
          ) : (
            <Tag color="default">{t('settings:backups.notConfigured', 'Not configured')}</Tag>
          )}
        </div>

        <div>
          <Text strong><ClockCircleOutlined /> {t('settings:backups.lastRun', 'Last backup')}: </Text>
          <Text>{lastRunDisplay}</Text>
        </div>

        {config.lastError && (
          <Alert
            type="warning"
            icon={<WarningOutlined />}
            message={t('settings:backups.lastErrorTitle', 'Last backup error')}
            description={backupErrorText(config.lastError, t)}
            showIcon
          />
        )}

        <Space>
          <Button
            icon={<FolderOpenOutlined />}
            onClick={handleChooseDirectory}
            loading={loading}
          >
            {config.directory
              ? t('settings:backups.changeDir', 'Change destination')
              : t('settings:backups.chooseDir', 'Choose destination')}
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleBackupNow}
            disabled={!config.directory}
            loading={running}
          >
            {t('settings:backups.runNow', 'Backup now')}
          </Button>
        </Space>
      </Space>
    </Card>
  );
};

export default BackupSettings;
