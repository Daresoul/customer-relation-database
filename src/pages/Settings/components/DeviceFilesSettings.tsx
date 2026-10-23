/**
 * DeviceFilesSettings — manages files received from lab devices (Exigo,
 * Healvet, MNChip, etc.).
 *
 * Two sections:
 *   - "Lab inbox" — a link to the inbox of results waiting to be attached.
 *   - "Recent Device Files" — a 14-day rolling list of everything the
 *     device-watcher subsystem has captured. Used for recovery if the
 *     app crashed mid-import or a file got dropped — the user can
 *     re-attach the file to a medical record from there.
 *
 * Split out of DeviceInputSettings so the Device Inputs page can stay
 * focused on integration configuration (ports, baud rates, file watch
 * directories) instead of mixing in file-management UI.
 */

import React from 'react';
import { Card, Button, Typography, Space } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import RecentDeviceFiles from '../../../components/RecentDeviceFiles';
import styles from '../Settings.module.css';

const { Text } = Typography;

const DeviceFilesSettings: React.FC = () => {
  const { t } = useTranslation(['settings', 'common']);
  const navigate = useNavigate();

  return (
    <div>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Card
          title={
            <span className={styles.cardTitle}>
              <FileTextOutlined />{' '}
              {t('settings:deviceFiles.labInbox')}
            </span>
          }
          className={styles.settingsCard}
          extra={
            <Button type="default" onClick={() => navigate('/lab-inbox')}>
              {t('settings:deviceFiles.openLabInbox')}
            </Button>
          }
        >
          <Text type="secondary">{t('settings:deviceFiles.labInboxDescription')}</Text>
        </Card>

        <Card
          title={
            <span className={styles.cardTitle}>
              <FileTextOutlined />{' '}
              {t('settings:deviceFiles.recentDeviceFiles', 'Recent Device Files (Last 14 Days)')}
            </span>
          }
          className={styles.settingsCard}
        >
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            {t(
              'settings:deviceFiles.recentDescription',
              'Files received from devices are tracked here for crash protection and recovery. You can view details and attach unprocessed files to medical records.',
            )}
          </Text>
          <RecentDeviceFiles days={14} />
        </Card>
      </Space>
    </div>
  );
};

export default DeviceFilesSettings;
