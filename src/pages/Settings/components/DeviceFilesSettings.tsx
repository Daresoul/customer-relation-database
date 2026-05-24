/**
 * DeviceFilesSettings — manages files received from lab devices (Exigo,
 * Healvet, MNChip, etc.).
 *
 * Two sections:
 *   - "Saved For Later" — files queued with a patient identifier for
 *     processing later. Opening the drawer lets the user review them
 *     and feed them into the medical-record import flow.
 *   - "Recent Device Files" — a 14-day rolling list of everything the
 *     device-watcher subsystem has captured. Used for recovery if the
 *     app crashed mid-import or a file got dropped — the user can
 *     re-attach the file to a medical record from there.
 *
 * Split out of DeviceInputSettings so the Device Inputs page can stay
 * focused on integration configuration (ports, baud rates, file watch
 * directories) instead of mixing in file-management UI.
 */

import React, { useState } from 'react';
import { Card, Button, Typography, Space } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import RecentDeviceFiles from '../../../components/RecentDeviceFiles';
import PendingDeviceList from '../../../components/PendingDeviceList';
import styles from '../Settings.module.css';

const { Text } = Typography;

const DeviceFilesSettings: React.FC = () => {
  const { t } = useTranslation(['settings', 'common']);
  const [pendingOpen, setPendingOpen] = useState(false);

  return (
    <div>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Card
          title={
            <span className={styles.cardTitle}>
              <FileTextOutlined />{' '}
              {t('settings:deviceFiles.savedForLater', 'Saved For Later')}
            </span>
          }
          className={styles.settingsCard}
          extra={
            <Button type="default" onClick={() => setPendingOpen(true)}>
              {t('settings:deviceFiles.openSavedForLater', 'Open Saved For Later')}
            </Button>
          }
        >
          <Text type="secondary">
            {t(
              'settings:deviceFiles.savedForLaterDescription',
              'Device files saved with a patient serial for later processing. Click "Open Saved For Later" to review and load files into the import flow.',
            )}
          </Text>
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

      {/* Saved For Later Drawer */}
      <PendingDeviceList open={pendingOpen} onClose={() => setPendingOpen(false)} />
    </div>
  );
};

export default DeviceFilesSettings;
