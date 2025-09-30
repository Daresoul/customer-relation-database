import type { ThemeConfig } from 'antd';

/**
 * CSS Variables utility for syncing Ant Design theme with CSS custom properties
 * This allows CSS modules to access theme values without hardcoding
 */

/**
 * Generate CSS variables from Ant Design theme configuration
 * These can be injected into the document root for use in CSS modules
 */
export const generateCSSVariables = (theme: ThemeConfig, isDark: boolean): Record<string, string> => {
  const token = theme.token || {};

  return {
    // Color System
    '--color-primary': token.colorPrimary || '#4A90E2',
    '--color-primary-hover': token.colorPrimaryHover || (isDark ? '#69A8E8' : '#40a9ff'),
    '--color-primary-active': token.colorPrimaryActive || (isDark ? '#2E7CD6' : '#096dd9'),
    '--color-success': token.colorSuccess || '#52C41A',
    '--color-warning': token.colorWarning || '#FAAD14',
    '--color-error': token.colorError || (isDark ? '#FF6B6B' : '#ff4d4f'),
    '--color-info': token.colorInfo || '#4A90E2',

    // Background Colors
    '--bg-base': token.colorBgBase || (isDark ? '#141414' : '#f5f5f5'),
    '--bg-container': token.colorBgContainer || (isDark ? '#1F1F1F' : '#ffffff'),
    '--bg-elevated': token.colorBgElevated || (isDark ? '#262626' : '#ffffff'),
    '--bg-layout': token.colorBgLayout || (isDark ? '#141414' : '#f5f5f5'),
    '--bg-spotlight': token.colorBgSpotlight || (isDark ? '#2A2A2A' : '#fafafa'),
    '--bg-mask': token.colorBgMask || 'rgba(0, 0, 0, 0.45)',

    // Text Colors
    '--text-base': token.colorTextBase || (isDark ? '#E6E6E6' : '#262626'),
    '--text-primary': token.colorText || (isDark ? '#E6E6E6' : '#262626'),
    '--text-secondary': token.colorTextSecondary || (isDark ? '#A6A6A6' : '#595959'),
    '--text-tertiary': token.colorTextTertiary || (isDark ? '#8C8C8C' : '#8c8c8c'),
    '--text-quaternary': token.colorTextQuaternary || (isDark ? '#5A5A5A' : '#bfbfbf'),
    '--text-disabled': token.colorTextDisabled || (isDark ? '#5A5A5A' : '#bfbfbf'),
    '--text-placeholder': token.colorTextPlaceholder || (isDark ? '#5A5A5A' : '#bfbfbf'),

    // Border Colors
    '--border-base': token.colorBorder || (isDark ? '#303030' : '#d9d9d9'),
    '--border-secondary': token.colorBorderSecondary || (isDark ? '#262626' : '#f0f0f0'),

    // Link Colors
    '--link-color': token.colorLink || (isDark ? '#4A90E2' : '#1890ff'),
    '--link-hover': token.colorLinkHover || (isDark ? '#69A8E8' : '#40a9ff'),
    '--link-active': token.colorLinkActive || (isDark ? '#2E7CD6' : '#096dd9'),

    // Spacing
    '--spacing-xs': '4px',
    '--spacing-sm': '8px',
    '--spacing-md': '12px',
    '--spacing-base': '16px',
    '--spacing-lg': '24px',
    '--spacing-xl': '32px',
    '--spacing-xxl': '48px',

    // Border Radius
    '--radius-xs': '2px',
    '--radius-sm': '4px',
    '--radius-base': `${token.borderRadius || 8}px`,
    '--radius-lg': '12px',
    '--radius-xl': '16px',

    // Typography
    '--font-family': token.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    '--font-size-sm': '12px',
    '--font-size-base': `${token.fontSize || 14}px`,
    '--font-size-lg': '16px',
    '--font-size-xl': '20px',
    '--font-size-xxl': '24px',
    '--font-weight-normal': '400',
    '--font-weight-medium': '500',
    '--font-weight-strong': `${token.fontWeightStrong || 600}`,
    '--line-height-base': token.lineHeight || '1.5',
    '--line-height-lg': token.lineHeightLG || '1.5',
    '--line-height-sm': token.lineHeightSM || '1.5',

    // Shadows
    '--shadow-sm': isDark
      ? '0 1px 2px 0 rgba(0, 0, 0, 0.45)'
      : '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
    '--shadow-base': token.boxShadow || (isDark
      ? '0 2px 8px rgba(0, 0, 0, 0.45)'
      : '0 2px 8px rgba(0, 0, 0, 0.06)'),
    '--shadow-lg': token.boxShadowSecondary || (isDark
      ? '0 4px 12px rgba(0, 0, 0, 0.35)'
      : '0 4px 12px rgba(0, 0, 0, 0.08)'),

    // Control Sizes
    '--control-height-sm': `${token.controlHeightSM || 32}px`,
    '--control-height': `${token.controlHeight || 36}px`,
    '--control-height-lg': `${token.controlHeightLG || 40}px`,

    // Animation
    '--motion-duration-fast': token.motionDurationFast || '0.1s',
    '--motion-duration-mid': token.motionDurationMid || '0.2s',
    '--motion-duration-slow': token.motionDurationSlow || '0.3s',
    '--motion-ease-in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
    '--motion-ease-out': 'cubic-bezier(0, 0, 0.2, 1)',
    '--motion-ease-in': 'cubic-bezier(0.4, 0, 1, 1)',

    // Z-index layers
    '--z-index-dropdown': '1050',
    '--z-index-modal': '1000',
    '--z-index-modal-mask': '1000',
    '--z-index-message': '1010',
    '--z-index-notification': '1010',
    '--z-index-popover': '1030',
    '--z-index-tooltip': '1060',

    // Component specific
    '--header-height': '64px',
    '--sider-width': '200px',
    '--sider-collapsed-width': '80px',
    '--footer-height': '70px',

    // Status colors for medical context
    '--status-active': '#52C41A',
    '--status-inactive': isDark ? '#5A5A5A' : '#bfbfbf',
    '--status-pending': '#FAAD14',
    '--status-error': isDark ? '#FF6B6B' : '#ff4d4f',
    '--status-success': '#52C41A',
    '--status-warning': '#FAAD14',
    '--status-info': token.colorInfo || '#4A90E2',
  };
};

/**
 * Inject CSS variables into the document
 */
export const injectCSSVariables = (variables: Record<string, string>): void => {
  const root = document.documentElement;

  Object.entries(variables).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
};

/**
 * Remove CSS variables from the document
 */
export const removeCSSVariables = (variables: Record<string, string>): void => {
  const root = document.documentElement;

  Object.keys(variables).forEach((key) => {
    root.style.removeProperty(key);
  });
};

/**
 * Get computed CSS variable value
 */
export const getCSSVariable = (variableName: string): string => {
  return getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
};

/**
 * Create CSS variable reference for use in CSS-in-JS
 */
export const cssVar = (variableName: string): string => {
  return `var(${variableName})`;
};

/**
 * Create CSS variable with fallback
 */
export const cssVarWithFallback = (variableName: string, fallback: string): string => {
  return `var(${variableName}, ${fallback})`;
};