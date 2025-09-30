import type { ThemeConfig } from 'antd';
import { theme } from 'antd';
import { createUnifiedTheme } from '../styles/theme/unifiedTheme';

/**
 * Legacy theme configurations - maintained for backward compatibility
 * New implementations should use createUnifiedTheme from unifiedTheme.ts
 */

/**
 * Dark theme configuration for the veterinary clinic application
 * Designed for extended use with eye-friendly colors and good contrast
 */
export const darkTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    // Primary brand colors - soft blue for medical context
    colorPrimary: '#4A90E2',
    colorSuccess: '#52C41A',
    colorWarning: '#FAAD14',
    colorError: '#FF6B6B',
    colorInfo: '#4A90E2',

    // Base colors for dark theme
    colorBgBase: '#141414',
    colorTextBase: '#E6E6E6',

    // Border and surface colors
    colorBorder: '#303030',
    borderRadius: 8,

    // Typography
    fontSize: 14,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',

    // Component specific tokens
    colorBgContainer: '#1F1F1F',
    colorBgElevated: '#262626',
    colorBgLayout: '#141414',
    colorBgSpotlight: '#2A2A2A',

    // Text colors with good contrast for dark mode
    colorText: '#E6E6E6',
    colorTextSecondary: '#A6A6A6',
    colorTextTertiary: '#8C8C8C',
    colorTextQuaternary: '#5A5A5A',

    // Link colors
    colorLink: '#4A90E2',
    colorLinkHover: '#69A8E8',
    colorLinkActive: '#2E7CD6',

    // Control colors
    controlHeight: 36,
    controlHeightLG: 40,
    controlHeightSM: 32,

    // Motion
    motionDurationSlow: '0.3s',
    motionDurationMid: '0.2s',
    motionDurationFast: '0.1s',

    // Box shadows for depth
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.45)',
    boxShadowSecondary: '0 4px 12px rgba(0, 0, 0, 0.35)',
  },
  components: {
    // Layout customizations
    Layout: {
      headerBg: '#1F1F1F',
      siderBg: '#1F1F1F',
      bodyBg: '#141414',
      footerBg: '#1F1F1F',
    },

    // Menu customizations for navigation
    Menu: {
      darkItemBg: '#1F1F1F',
      darkSubMenuItemBg: '#141414',
      darkItemSelectedBg: '#2A2A2A',
      darkItemHoverBg: '#262626',
    },

    // Form customizations
    Form: {
      labelColor: '#E6E6E6',
      labelRequiredMarkColor: '#FF6B6B',
      verticalLabelPadding: '0 0 8px',
    },

    // Table customizations for data display
    Table: {
      headerBg: '#262626',
      headerColor: '#E6E6E6',
      rowHoverBg: '#2A2A2A',
      rowSelectedBg: '#303030',
      rowSelectedHoverBg: '#353535',
      colorBgContainer: '#1F1F1F',
    },

    // Button customizations
    Button: {
      primaryShadow: '0 2px 4px rgba(74, 144, 226, 0.3)',
      defaultBg: '#262626',
      defaultBorderColor: '#303030',
    },

    // Input customizations
    Input: {
      activeBg: '#1F1F1F',
      hoverBg: '#1F1F1F',
      colorBgContainer: '#1F1F1F',
    },

    // Card customizations
    Card: {
      colorBgContainer: '#1F1F1F',
      colorBorderSecondary: '#303030',
    },

    // Modal customizations
    Modal: {
      contentBg: '#1F1F1F',
      headerBg: '#1F1F1F',
      footerBg: '#1F1F1F',
    },

    // Select customizations
    Select: {
      optionSelectedBg: '#2A2A2A',
      optionActiveBg: '#262626',
    },

    // DatePicker customizations
    DatePicker: {
      cellActiveWithRangeBg: '#2A2A2A',
      cellHoverBg: '#262626',
      cellBgDisabled: '#141414',
    },

    // Notification customizations
    Notification: {
      colorBgElevated: '#262626',
    },

    // Alert customizations
    Alert: {
      colorInfoBg: 'rgba(74, 144, 226, 0.1)',
      colorInfoBorder: 'rgba(74, 144, 226, 0.3)',
      colorSuccessBg: 'rgba(82, 196, 26, 0.1)',
      colorSuccessBorder: 'rgba(82, 196, 26, 0.3)',
      colorWarningBg: 'rgba(250, 173, 20, 0.1)',
      colorWarningBorder: 'rgba(250, 173, 20, 0.3)',
      colorErrorBg: 'rgba(255, 107, 107, 0.1)',
      colorErrorBorder: 'rgba(255, 107, 107, 0.3)',
    },

    // Tabs customizations
    Tabs: {
      cardBg: '#1F1F1F',
      itemHoverColor: '#69A8E8',
      itemSelectedColor: '#4A90E2',
    },
  },
};

/**
 * Light theme configuration (optional - for users who prefer light mode)
 * Based on the original medical theme from research
 */
export const lightTheme: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: '#1890ff',
    colorSuccess: '#52c41a',
    colorWarning: '#faad14',
    colorError: '#ff4d4f',
    colorInfo: '#1890ff',
    borderRadius: 8,
    fontSize: 14,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',

    // High contrast for medical/professional use
    colorText: '#262626',
    colorTextSecondary: '#595959',
    colorTextTertiary: '#8c8c8c',

    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgLayout: '#f5f5f5',

    controlHeight: 36,
    controlHeightLG: 40,
    controlHeightSM: 32,
  },
  components: {
    Form: {
      labelColor: '#262626',
      labelRequiredMarkColor: '#ff4d4f',
    },
    Table: {
      headerBg: '#fafafa',
      headerColor: '#262626',
      rowHoverBg: '#f5f5f5',
    },
    Button: {
      primaryShadow: '0 2px 4px rgba(24, 144, 255, 0.12)',
    },
  },
};

// Export the default theme (dark)
export const medicalTheme = darkTheme;

// Theme switcher helper
export const getTheme = (isDark: boolean = true): ThemeConfig => {
  return isDark ? darkTheme : lightTheme;
};