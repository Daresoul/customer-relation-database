import React from 'react';
import { Alert, Button, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import type { UpdateManifest, UpdateStatus } from '../types/update';

interface UpdateBannerProps {
  status: UpdateStatus;
  manifest: UpdateManifest | null;
  onInstall: () => void;
}

/** The update offer and its progress, kept on screen until the app restarts. */
export const UpdateBanner: React.FC<UpdateBannerProps> = ({ status, manifest, onInstall }) => {
  const { t } = useTranslation('settings');

  if (status === 'downloading' || status === 'installing') {
    return (
      <Alert
        type="info"
        banner
        showIcon
        icon={<Spin size="small" />}
        message={t(status === 'downloading' ? 'updates.progress.downloading' : 'updates.progress.installing')}
      />
    );
  }

  if (status !== 'ready' || !manifest) return null;

  return (
    <Alert
      type="info"
      banner
      showIcon
      message={t('updates.updateAvailableVersion', { version: manifest.version })}
      description={manifest.notes ? manifest.notes.split('\n')[0] : t('updates.newVersionAvailable')}
      action={
        <Button type="primary" size="small" onClick={onInstall}>
          {t('updates.installAndRestart')}
        </Button>
      }
    />
  );
};
