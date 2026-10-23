/**
 * useUpdater Hook
 * Feature: Auto-Update System
 * Manages update state and provides update checking/installation functions.
 * The offer and the progress are shown by `UpdateBanner` (in `AppWrapper`).
 */

import { useState, useEffect, useCallback } from 'react';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { updateService, createBackupFailedConfirm } from '../services/updateService';
import type { UpdateManifest, UpdateStatus } from '../types/update';

export function useUpdater() {
  const { t } = useTranslation('settings');
  const { notification, modal } = App.useApp();
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [manifest, setManifest] = useState<UpdateManifest | null>(null);

  /** Checks for an update; resolves false when the check failed. */
  const checkForUpdates = useCallback(async (): Promise<boolean> => {
    try {
      setStatus('checking');
      const result = await updateService.checkForUpdates();
      updateService.clearCheckFailure();

      if (result.shouldUpdate && result.manifest) {
        setManifest(result.manifest);
        setStatus('ready');
        await updateService.recordCheck(result.manifest.version);
      } else {
        setStatus('idle');
        await updateService.recordCheck();
      }
      return true;
    } catch (error) {
      setStatus('error');
      updateService.recordCheckFailure(error);
      console.error('Update check failed:', error);
      return false;
    }
  }, []);

  /** Install the downloaded update and restart the app. */
  const installUpdate = useCallback(async () => {
    try {
      setStatus('installing');
      const installing = await updateService.installAndRestart(createBackupFailedConfirm(modal, t));
      if (!installing) setStatus('ready');
    } catch (error) {
      setStatus('ready');
      console.error('Update installation failed:', error);
      notification.error({
        message: t('updates.updateInstallationFailed'),
        description: t('updates.messages.installFailed'),
        placement: 'topRight',
      });
    }
  }, [notification, modal, t]);

  /** Updater events: PENDING while downloading, DONE, ERROR. */
  useEffect(() => {
    const unlisten = updateService.onUpdateEvent(({ status: eventStatus }) => {
      if (eventStatus === 'PENDING') setStatus('downloading');
      if (eventStatus === 'DONE') setStatus('installing');
      if (eventStatus === 'ERROR') setStatus('error');
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return {
    status,
    manifest,
    checkForUpdates,
    installUpdate,
  };
}
