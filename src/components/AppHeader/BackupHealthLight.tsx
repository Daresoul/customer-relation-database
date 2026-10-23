import { Button, Tooltip, theme } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { invoke } from '@/services/invoke';
import type { BackupConfig } from '@/types/generated/BackupConfig';
import { backupHealth, BACKUP_CONFIG_KEY, type BackupLevel, type BackupReason } from './backupHealth';
import styles from './AppHeader.module.css';

dayjs.extend(relativeTime);

/** Header light for the backup; click opens Settings at Backups. */
export function BackupHealthLight() {
  const { t } = useTranslation('shell');
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const { data, isError } = useQuery({
    queryKey: BACKUP_CONFIG_KEY,
    queryFn: () => invoke<BackupConfig>('get_backup_config'),
    refetchInterval: 5 * 60 * 1000,
  });

  const now = new Date();
  const health = data
    ? backupHealth(data, now)
    : { level: 'warn' as BackupLevel, reason: (isError ? 'unknown' : null) as BackupReason | null };
  const ago = data?.lastBackupAt ? dayjs(data.lastBackupAt).from(now) : '';
  const detail = health.reason ? t(`shell:backup.${health.reason}`, { ago, error: data?.lastError ?? '' }) : '';
  const colour = { ok: token.colorSuccess, warn: token.colorWarning, failed: token.colorError }[health.level];

  return (
    <Tooltip title={detail ? `${detail} ${t('shell:backup.open')}` : t('shell:backup.open')}>
      <Button
        type="text"
        size="small"
        data-level={data || isError ? health.level : undefined}
        aria-label={`${t('shell:backup.label')}: ${detail}`}
        className={styles.backupLight}
        onClick={() => navigate('/settings?section=backups')}
      >
        <span className={styles.dot} style={{ background: data || isError ? colour : token.colorTextQuaternary }} />
        {t('shell:backup.label')}
      </Button>
    </Tooltip>
  );
}
