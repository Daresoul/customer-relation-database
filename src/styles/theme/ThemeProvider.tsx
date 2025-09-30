/**
 * Enhanced Theme Provider that combines Ant Design theming with CSS variables
 * This provides a single source of truth for all styling
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ConfigProvider, theme as antTheme } from 'antd';
import { createUnifiedTheme } from './unifiedTheme';
import { generateCSSVariables, injectCSSVariables } from './cssVariables';

export type ThemeMode = 'dark' | 'light';

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  primaryColor: string;
  setPrimaryColor: (color: string) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  cssVariables: Record<string, string>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const EnhancedThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark');
  const [primaryColor, setPrimaryColorState] = useState('#4A90E2');
  const [fontSize, setFontSizeState] = useState(14);
  const [cssVariables, setCssVariables] = useState<Record<string, string>>({});

  // Load theme preference on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('themeMode') as ThemeMode;
    const savedColor = localStorage.getItem('primaryColor');
    const savedFontSize = localStorage.getItem('fontSize');

    if (savedTheme && ['dark', 'light'].includes(savedTheme)) {
      setThemeModeState(savedTheme);
    }
    if (savedColor) {
      setPrimaryColorState(savedColor);
    }
    if (savedFontSize) {
      setFontSizeState(parseInt(savedFontSize, 10));
    }
  }, []);

  // Update CSS variables whenever theme changes
  useEffect(() => {
    const theme = createUnifiedTheme({
      mode: themeMode,
      primaryColor,
      fontSize,
    });

    const variables = generateCSSVariables(theme, themeMode === 'dark');
    setCssVariables(variables);
    injectCSSVariables(variables);

    // Also set the data-theme attribute for legacy CSS
    document.documentElement.setAttribute('data-theme', themeMode);

    // Apply theme-specific classes to body
    document.body.className = themeMode === 'dark' ? 'dark-theme' : 'light-theme';
  }, [themeMode, primaryColor, fontSize]);

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
  const currentTheme = createUnifiedTheme({
    mode: themeMode,
    primaryColor,
    fontSize,
  });

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        setThemeMode,
        primaryColor,
        setPrimaryColor,
        fontSize,
        setFontSize,
        cssVariables,
      }}
    >
      <ConfigProvider theme={currentTheme}>
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
};

export const useEnhancedTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useEnhancedTheme must be used within an EnhancedThemeProvider');
  }
  return context;
};

/**
 * Hook to get CSS variable values
 */
export const useCSSVariable = (variableName: string): string => {
  const { cssVariables } = useEnhancedTheme();
  return cssVariables[variableName] || '';
};

/**
 * Hook to get multiple CSS variables
 */
export const useCSSVariables = (variableNames: string[]): Record<string, string> => {
  const { cssVariables } = useEnhancedTheme();
  return variableNames.reduce((acc, name) => {
    acc[name] = cssVariables[name] || '';
    return acc;
  }, {} as Record<string, string>);
};