import React, { useEffect, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useUpdater } from '../hooks/useUpdater';
import { updateService } from '../services/updateService';
import { appWindow } from '@tauri-apps/api/window';

export const AppWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { themeMode } = useTheme();
  const backgroundColor = themeMode === 'light' ? '#f5f5f5' : '#141414';
  const { checkForUpdates } = useUpdater();
  const lastCheckTimeRef = useRef<number>(0);

  // T025: Check for updates on app startup (10s delay)
  useEffect(() => {
    async function checkOnStartup() {
      try {
        const prefs = await updateService.getPreferences();

        if (prefs.autoCheckEnabled) {
          // Wait 10 seconds after app start, then check for updates
          const timer = setTimeout(() => {
            checkForUpdates();
            lastCheckTimeRef.current = Date.now();
          }, 10000);

          return () => clearTimeout(timer);
        }
      } catch (error) {
        console.error('Failed to check update preferences on startup:', error);
      }
    }

    checkOnStartup();
  }, [checkForUpdates]);

  // T026: Check for updates on window focus (if >1 hour since last check)
  useEffect(() => {
    let unlistenFocus: (() => void) | null = null;

    async function setupFocusListener() {
      try {
        const unlisten = await appWindow.onFocusChanged(async ({ payload: focused }) => {
          if (focused) {
            const now = Date.now();
            const oneHour = 60 * 60 * 1000;

            // Check if more than 1 hour has passed since last check
            if (now - lastCheckTimeRef.current > oneHour) {
              const prefs = await updateService.getPreferences();

              if (prefs.autoCheckEnabled) {
                checkForUpdates();
                lastCheckTimeRef.current = now;
              }
            }
          }
        });

        unlistenFocus = unlisten;
      } catch (error) {
        console.error('Failed to setup focus listener:', error);
      }
    }

    setupFocusListener();

    return () => {
      if (unlistenFocus) {
        unlistenFocus();
      }
    };
  }, [checkForUpdates]);

  // T027: Check for updates on network online (2s delay after reconnection)
  useEffect(() => {
    async function handleOnline() {
      try {
        const prefs = await updateService.getPreferences();

        if (prefs.autoCheckEnabled) {
          // Wait 2 seconds for system stability after network reconnection
          setTimeout(() => {
            checkForUpdates();
            lastCheckTimeRef.current = Date.now();
          }, 2000);
        }
      } catch (error) {
        console.error('Failed to check for updates on network reconnection:', error);
      }
    }

    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
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
      {children}
    </div>
  );
};