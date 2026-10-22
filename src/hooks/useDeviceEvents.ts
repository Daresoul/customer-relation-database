import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import type { DeviceEvent } from '../types/deviceIntegration';

/**
 * Shows backend `device-event`s (unreadable, empty or cut-off results, a
 * result that couldn't be saved, a lost folder) as toasts with what to do.
 */
export const useDeviceEvents = (): void => {
  const { notification } = App.useApp();
  const { t } = useTranslation('devices');
  const notificationRef = useRef(notification);
  const tRef = useRef(t);

  useEffect(() => {
    notificationRef.current = notification;
    tRef.current = t;
  }, [notification, t]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    listen<DeviceEvent>('device-event', (event) => {
      const e = event.payload;
      const translate = tRef.current;
      const show = e.kind === 'save_failed' || e.kind === 'folder_lost'
        ? notificationRef.current.error
        : notificationRef.current.warning;
      show({
        message: translate(e.messageKey, { device: e.deviceName }),
        description: translate(`${e.messageKey}Action`),
        placement: 'bottomRight',
        duration: 10,
      });
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
};
