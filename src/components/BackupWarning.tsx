import { Alert, Button } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@/services/invoke';
import type { BackupConfig } from '@/types/generated/BackupConfig';
import { backupHealth, BACKUP_CONFIG_KEY } from './AppHeader/backupHealth';
import { backupErrorText } from '@/utils/backupErrors';

/** Dashboard warning when backups are not set up or the last one failed. */
export function BackupWarning() {
  const { t } = useTranslation('shell');
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: BACKUP_CONFIG_KEY,
    queryFn: () => invoke<BackupConfig>('get_backup_config'),
    refetchInterval: 5 * 60 * 1000,
  });
  if (!data) return null;

  const { reason } = backupHealth(data, new Date());
  if (reason !== 'notConfigured' && reason !== 'failed') return null;

  return (
    <Alert
      type={reason === 'failed' ? 'error' : 'warning'}
      showIcon
      message={t(reason === 'failed' ? 'shell:backup.dashboard.failed' : 'shell:backup.dashboard.notConfigured')}
      description={reason === 'failed' && data.lastError ? backupErrorText(data.lastError, t) : undefined}
      action={
        <Button size="small" onClick={() => navigate('/settings?section=backups')}>
          {t('shell:backup.dashboard.openSettings')}
        </Button>
      }
    />
  );
}
