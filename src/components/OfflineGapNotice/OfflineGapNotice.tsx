import React, { useEffect } from 'react';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { invoke } from '@/services/invoke';
import { formatDateTime } from '@/utils/dateFormatter';

interface OfflineGap {
  from: string;
  to: string;
}

/** Once per start: Arkivet was closed during clinic hours, so serial results from then are lost. */
export const OfflineGapNotice: React.FC = () => {
  const { t } = useTranslation('devices');
  const { notification } = App.useApp();

  useEffect(() => {
    invoke<OfflineGap | null>('take_offline_gap')
      .then((gap) => {
        if (!gap) return;
        notification.warning({
          key: 'offline-gap',
          message: t('devices:offlineGap.title'),
          description: t('devices:offlineGap.body', { from: formatDateTime(gap.from), to: formatDateTime(gap.to) }),
          placement: 'topRight',
          duration: 0,
        });
      })
      .catch(() => {});
  }, [notification, t]);

  return null;
};
