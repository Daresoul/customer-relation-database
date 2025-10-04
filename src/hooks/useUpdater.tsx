/**
 * useUpdater Hook
 * Feature: Auto-Update System
 * Manages update state and provides update checking/installation functions
 */

import React, { useState, useEffect, useCallback } from 'react';
import { App, Button } from 'antd';
import { updateService } from '../services/updateService';
import type { UpdateManifest, UpdateStatus } from '../types/update';

export function useUpdater() {
  const { notification } = App.useApp();
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [manifest, setManifest] = useState<UpdateManifest | null>(null);

  /**
   * Check for updates and show notification if available
   */
  const checkForUpdates = useCallback(async () => {
    try {
      setStatus('checking');

      const result = await updateService.checkForUpdates();

      if (result.shouldUpdate && result.manifest) {
        setManifest(result.manifest);
        setStatus('ready');

        // Record that we notified the user about this version
        await updateService.recordCheck(result.manifest.version);

        // Show non-intrusive notification with install button
        const description = result.manifest.notes
          ? result.manifest.notes.split('\n')[0]
          : 'A new version is available';

        notification.info({
          message: `Update Available: ${result.manifest.version}`,
          description,
          duration: 0, // Don't auto-close
          placement: 'topRight',
          key: 'update-available',
          actions: (
            <Button
              type="primary"
              size="small"
              onClick={async () => {
                notification.destroy('update-available');
                try {
                  setStatus('installing');
                  await updateService.installAndRestart();
                } catch (error) {
                  setStatus('error');
                  console.error('Update installation failed:', error);
                  notification.error({
                    message: 'Update Installation Failed',
                    description: 'Failed to install the update. Please try again later.',
                    placement: 'topRight',
                  });
                }
              }}
            >
              Install & Restart
            </Button>
          ),
        });
      } else {
        setStatus('idle');
        // Record check without version (no update available)
        await updateService.recordCheck();
      }
    } catch (error) {
      setStatus('error');
      console.error('Update check failed:', error);
    }
  }, [notification]);

  /**
   * Install the downloaded update and restart the app
   */
  const installUpdate = useCallback(async () => {
    try {
      setStatus('installing');
      await updateService.installAndRestart();
    } catch (error) {
      setStatus('error');
      console.error('Update installation failed:', error);
      notification.error({
        message: 'Update Installation Failed',
        description: 'Failed to install the update. Please try again later.',
        placement: 'topRight',
      });
    }
  }, [notification]);

  /**
   * Subscribe to updater events (PENDING, DONE, ERROR)
   */
  useEffect(() => {
    const unlisten = updateService.onUpdateEvent(({ status: eventStatus }) => {
      if (eventStatus === 'PENDING') {
        setStatus('downloading');
      }
      if (eventStatus === 'DONE') {
        setStatus('ready');
      }
      if (eventStatus === 'ERROR') {
        setStatus('error');
      }
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
