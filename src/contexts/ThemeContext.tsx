/**
 * T034: Theme context for managing application theme
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ConfigProvider, theme as antTheme } from 'antd';
import { darkTheme, lightTheme, medicalTheme } from '../config/theme.config';

export type ThemeMode = 'dark' | 'light' | 'medical';

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  primaryColor: string;
  setPrimaryColor: (color: string) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const themeMap = {
  dark: darkTheme,
  light: lightTheme,
  medical: medicalTheme,
};

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark');
  const [primaryColor, setPrimaryColorState] = useState('#4A90E2');
  const [fontSize, setFontSizeState] = useState(14);

  // Load theme preference on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('themeMode') as ThemeMode;
    const savedColor = localStorage.getItem('primaryColor');
    const savedFontSize = localStorage.getItem('fontSize');

    if (savedTheme && ['dark', 'light', 'medical'].includes(savedTheme)) {
      setThemeModeState(savedTheme);
    }
    if (savedColor) {
      setPrimaryColorState(savedColor);
    }
    if (savedFontSize) {
      setFontSizeState(parseInt(savedFontSize, 10));
    }
  }, []);

  // Save theme preference
  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    localStorage.setItem('themeMode', mode);
  };

  const setPrimaryColor = (color: string) => {
    setPrimaryColorState(color);
    localStorage.setItem('primaryColor', color);
  };

  const setFontSize = (size: number) => {
    setFontSizeState(size);
    localStorage.setItem('fontSize', size.toString());
  };

  // Get current theme config
  const currentTheme = {
    ...themeMap[themeMode],
    token: {
      ...themeMap[themeMode].token,
      colorPrimary: primaryColor,
      fontSize,
    },
  };

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        setThemeMode,
        primaryColor,
        setPrimaryColor,
        fontSize,
        setFontSize,
      }}
    >
      <ConfigProvider theme={currentTheme}>
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};