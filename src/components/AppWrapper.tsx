import React, { useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useUpdater } from '../hooks/useUpdater';
import { updateService } from '../services/updateService';

export const AppWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { themeMode } = useTheme();
  const backgroundColor = themeMode === 'light' ? '#f5f5f5' : '#141414';
  const { checkForUpdates } = useUpdater();

  // T025: Check for updates on app startup (10s delay)
  useEffect(() => {
    async function checkOnStartup() {
      try {
        const prefs = await updateService.getPreferences();

        if (prefs.autoCheckEnabled) {
          // Wait 10 seconds after app start, then check for updates
          const timer = setTimeout(() => {
            checkForUpdates();
          }, 10000);

          return () => clearTimeout(timer);
        }
      } catch (error) {
        console.error('Failed to check update preferences on startup:', error);
      }
    }

    checkOnStartup();
  }, [checkForUpdates]);

  // Automatic update checks on focus and network reconnection removed
  // Only checks on app startup and manual button click

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