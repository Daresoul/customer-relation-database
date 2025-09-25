import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

export const AppWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { themeMode } = useTheme();
  const backgroundColor = themeMode === 'light' ? '#f5f5f5' : '#141414';

  React.useEffect(() => {
    // Apply theme to document
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