import { useTheme } from '../contexts/ThemeContext';

export interface ThemeColors {
  background: string;
  containerBg: string;
  cardBg: string;
  text: string;
  textSecondary: string;
  border: string;
  hover: string;
  selected: string;
}

export const getThemeColors = (theme: 'light' | 'dark'): ThemeColors => {
  if (theme === 'light') {
    return {
      background: '#f5f5f5',
      containerBg: '#ffffff',
      cardBg: '#ffffff',
      text: '#262626',
      textSecondary: '#595959',
      border: '#d9d9d9',
      hover: '#f0f0f0',
      selected: '#e6f4ff',
    };
  }

  // Dark theme
  return {
    background: '#141414',
    containerBg: '#1f1f1f',
    cardBg: '#1f1f1f',
    text: '#E6E6E6',
    textSecondary: '#A6A6A6',
    border: '#303030',
    hover: '#2A2A2A',
    selected: '#303030',
  };
};

export const useThemeColors = () => {
  const { themeMode } = useTheme();
  return getThemeColors(themeMode);
};