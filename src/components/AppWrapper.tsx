import React, { useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useUpdater } from '../hooks/useUpdater';
import { updateService } from '../services/updateService';
import { scheduleUpdateChecks } from '../services/updateCheckSchedule';
import { UpdateBanner } from './UpdateBanner';
import styles from './AppWrapper.module.css';

export const AppWrapper: React.FC<{ header?: React.ReactNode; children: React.ReactNode }> = ({ header, children }) => {
  const { themeMode } = useTheme();
  const backgroundColor = themeMode === 'light' ? '#f5f5f5' : '#141414';
  const { checkForUpdates, status, manifest, installUpdate } = useUpdater();

  // 10 s after start, retried after 5, 15 and 60 minutes when it fails, then daily.
  useEffect(() => {
    if (import.meta.env.DEV) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    updateService
      .getPreferences()
      .then((prefs) => {
        if (!cancelled && prefs.autoCheckEnabled) stop = scheduleUpdateChecks(checkForUpdates);
      })
      .catch((error) => console.error('Failed to read update preferences:', error));
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [checkForUpdates]);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
    document.body.style.backgroundColor = backgroundColor;
  }, [themeMode, backgroundColor]);

  return (
    <div
      className="App"
      style={{
        backgroundColor,
        minHeight: '100vh',
        transition: 'background-color 0.3s ease'
      }}
    >
      <div className={styles.shellTop}>
        {header}
        <UpdateBanner status={status} manifest={manifest} onInstall={installUpdate} />
      </div>
      {children}
    </div>
  );
};