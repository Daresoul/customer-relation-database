import type { ThemeConfig } from 'antd';
import { theme } from 'antd';

/**
 * Unified theme configuration that consolidates all styling into Ant Design's theme system
 * This eliminates the need for !important declarations in CSS
 */

interface CustomThemeOptions {
  mode: 'dark' | 'light';
  primaryColor?: string;
  fontSize?: number;
}

/**
 * Creates a comprehensive theme configuration with all component overrides
 * Previously these were handled with !important in CSS files
 */
export const createUnifiedTheme = ({
  mode,
  primaryColor = '#4A90E2',
  fontSize = 14,
}: CustomThemeOptions): ThemeConfig => {
  const isDark = mode === 'dark';

  return {
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      // Primary brand colors
      colorPrimary: primaryColor,
      colorSuccess: '#52C41A',
      colorWarning: '#FAAD14',
      colorError: isDark ? '#FF6B6B' : '#ff4d4f',
      colorInfo: primaryColor,

      // Base colors - replaces CSS !important overrides
      colorBgBase: isDark ? '#141414' : '#f5f5f5',
      colorTextBase: isDark ? '#E6E6E6' : '#262626',

      // Border and surface colors
      colorBorder: isDark ? '#303030' : '#d9d9d9',
      borderRadius: 8,

      // Typography
      fontSize,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      fontWeightStrong: 600,

      // Component specific tokens
      colorBgContainer: isDark ? '#1F1F1F' : '#ffffff',
      colorBgElevated: isDark ? '#262626' : '#ffffff',
      colorBgLayout: isDark ? '#141414' : '#f5f5f5',
      colorBgSpotlight: isDark ? '#2A2A2A' : '#fafafa',

      // Text colors with proper contrast
      colorText: isDark ? '#E6E6E6' : '#262626',
      colorTextSecondary: isDark ? '#A6A6A6' : '#595959',
      colorTextTertiary: isDark ? '#8C8C8C' : '#8c8c8c',
      colorTextQuaternary: isDark ? '#5A5A5A' : '#bfbfbf',

      // Link colors
      colorLink: isDark ? primaryColor : '#1890ff',
      colorLinkHover: isDark ? '#69A8E8' : '#40a9ff',
      colorLinkActive: isDark ? '#2E7CD6' : '#096dd9',

      // Control sizing
      controlHeight: 36,
      controlHeightLG: 40,
      controlHeightSM: 32,

      // Motion
      motionDurationSlow: '0.3s',
      motionDurationMid: '0.2s',
      motionDurationFast: '0.1s',

      // Box shadows for depth
      boxShadow: isDark
        ? '0 2px 8px rgba(0, 0, 0, 0.45)'
        : '0 2px 8px rgba(0, 0, 0, 0.06)',
      boxShadowSecondary: isDark
        ? '0 4px 12px rgba(0, 0, 0, 0.35)'
        : '0 4px 12px rgba(0, 0, 0, 0.08)',
    },
    components: {
      // Layout customizations - replaces antd.css lines 89-106
      Layout: {
        headerBg: isDark ? '#1F1F1F' : '#ffffff',
        headerPadding: '0 24px',
        siderBg: isDark ? '#1F1F1F' : '#ffffff',
        bodyBg: isDark ? '#141414' : '#f5f5f5',
        footerBg: isDark ? '#1F1F1F' : '#ffffff',
      },

      // Table customizations - replaces antd.css lines 108-126
      Table: {
        headerBg: isDark ? '#262626' : '#fafafa',
        headerColor: isDark ? '#E6E6E6' : '#262626',
        headerSortActiveBg: isDark ? '#262626' : '#f0f0f0',
        headerFilterHoverBg: isDark ? '#303030' : '#f0f0f0',
        rowHoverBg: isDark ? '#2A2A2A' : '#f5f5f5',
        rowSelectedBg: isDark ? '#303030' : '#e6f4ff',
        rowSelectedHoverBg: isDark ? '#353535' : '#bae0ff',
        colorBgContainer: isDark ? '#1F1F1F' : '#ffffff',
        borderColor: isDark ? '#303030' : '#f0f0f0',
        footerBg: isDark ? '#1F1F1F' : '#fafafa',
      },

      // Form customizations - replaces antd.css lines 128-136
      Form: {
        labelColor: isDark ? '#E6E6E6' : '#262626',
        labelFontSize: fontSize,
        labelHeight: 32,
        labelColonMarginInlineStart: 2,
        labelColonMarginInlineEnd: 8,
        labelRequiredMarkColor: isDark ? '#FF6B6B' : '#ff4d4f',
        verticalLabelPadding: '0 0 8px',
        itemMarginBottom: 24,
      },

      // Input customizations - replaces antd.css lines 138-157
      Input: {
        activeBg: isDark ? '#1F1F1F' : '#ffffff',
        activeBorderColor: primaryColor,
        activeShadow: `0 0 0 2px ${isDark ? 'rgba(74, 144, 226, 0.2)' : 'rgba(24, 144, 255, 0.2)'}`,
        addonBg: isDark ? '#262626' : '#fafafa',
        colorBgContainer: isDark ? '#1F1F1F' : '#ffffff',
        colorBorder: isDark ? '#303030' : '#d9d9d9',
        colorText: isDark ? '#E6E6E6' : '#262626',
        colorTextPlaceholder: isDark ? '#5A5A5A' : '#bfbfbf',
        hoverBg: isDark ? '#1F1F1F' : '#ffffff',
        hoverBorderColor: isDark ? '#404040' : '#40a9ff',
      },

      // Button customizations - replaces antd.css lines 159-185
      Button: {
        primaryShadow: `0 2px 4px ${isDark ? 'rgba(74, 144, 226, 0.3)' : 'rgba(24, 144, 255, 0.12)'}`,
        defaultBg: isDark ? '#262626' : '#ffffff',
        defaultBorderColor: isDark ? '#303030' : '#d9d9d9',
        defaultColor: isDark ? '#E6E6E6' : '#262626',
        defaultHoverBg: isDark ? '#303030' : '#ffffff',
        defaultHoverBorderColorr: isDark ? '#404040' : '#40a9ff',
        defaultHoverColor: isDark ? '#E6E6E6' : '#40a9ff',
        dangerColor: isDark ? '#ff4d4f' : '#ff4d4f',
        dangerShadow: '0 2px 4px rgba(255, 77, 79, 0.2)',
        fontWeight: 500,
      },

      // Card customizations - replaces antd.css lines 187-198
      Card: {
        colorBgContainer: isDark ? '#1F1F1F' : '#ffffff',
        colorBorderSecondary: isDark ? '#303030' : '#f0f0f0',
        headerBg: isDark ? '#262626' : '#fafafa',
        headerFontSize: 16,
        headerFontSizeSM: 14,
        paddingLG: 24,
        boxShadowTertiary: isDark
          ? '0 1px 2px 0 rgba(0, 0, 0, 0.45)'
          : '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
      },

      // Modal customizations - replaces antd.css lines 200-275
      Modal: {
        contentBg: isDark ? '#1F1F1F' : '#ffffff',
        headerBg: isDark ? '#1F1F1F' : '#ffffff',
        headerBorderColorSplit: isDark ? '#303030' : '#f0f0f0',
        headerBorderWidth: 1,
        footerBg: isDark ? '#1F1F1F' : '#ffffff',
        footerBorderColorSplit: isDark ? '#303030' : '#f0f0f0',
        footerBorderWidth: 1,
        colorText: isDark ? '#E6E6E6' : '#262626',
        colorTextHeading: isDark ? '#E6E6E6' : '#262626',
        // Confirm modal specific
        confirmBodyPadding: 32,
        confirmTitleFontSize: 16,
      },

      // Tabs customizations - replaces antd.css lines 276-291
      Tabs: {
        cardBg: isDark ? '#1F1F1F' : '#ffffff',
        cardGutter: 2,
        cardHeight: 40,
        cardPadding: '8px 16px',
        cardPaddingSM: '6px 12px',
        cardPaddingLG: '8px 20px',
        horizontalMargin: '0 0 16px 0',
        itemActiveColor: primaryColor,
        itemColor: isDark ? '#A6A6A6' : '#595959',
        itemHoverColor: isDark ? '#E6E6E6' : '#262626',
        itemSelectedColor: primaryColor,
        inkBarColor: primaryColor,
        titleFontSize: fontSize,
        titleFontSizeLG: 16,
        titleFontSizeSM: fontSize,
      },

      // Menu customizations - replaces antd.css lines 293-300
      Menu: {
        darkItemBg: '#1F1F1F',
        darkSubMenuItemBg: '#141414',
        darkItemSelectedBg: '#2A2A2A',
        darkItemHoverBg: '#262626',
        itemBg: isDark ? '#1F1F1F' : '#ffffff',
        itemColor: isDark ? '#E6E6E6' : '#262626',
        itemHoverBg: isDark ? '#262626' : '#f5f5f5',
        itemHoverColor: isDark ? '#E6E6E6' : '#262626',
        itemSelectedBg: isDark ? '#2A2A2A' : '#e6f4ff',
        itemSelectedColor: primaryColor,
        subMenuItemBg: isDark ? '#141414' : '#fafafa',
      },

      // Select customizations - replaces antd.css lines 312-324
      Select: {
        clearBg: isDark ? '#1F1F1F' : '#ffffff',
        multipleItemBg: isDark ? '#262626' : '#f5f5f5',
        optionActiveBg: isDark ? '#303030' : '#f5f5f5',
        optionFontSize: fontSize,
        optionHeight: 32,
        optionPadding: '5px 12px',
        optionSelectedBg: isDark ? '#2A2A2A' : '#e6f4ff',
        optionSelectedColor: isDark ? '#E6E6E6' : '#262626',
        optionSelectedFontWeight: 500,
        selectorBg: isDark ? '#1F1F1F' : '#ffffff',
        singleItemHeightLG: 40,
      },

      // DatePicker customizations - replaces antd.css lines 326-338
      DatePicker: {
        cellActiveWithRangeBg: isDark ? '#2A2A2A' : '#e6f4ff',
        cellBgDisabled: isDark ? '#141414' : '#f5f5f5',
        cellHoverBg: isDark ? '#262626' : '#f5f5f5',
        cellHoverWithRangeBg: isDark ? '#303030' : '#f0f0f0',
        cellRangeBorderColor: primaryColor,
        cellRangeHoverBg: isDark ? '#303030' : '#f0f0f0',
        cellHeight: 24,
        cellWidth: 36,
        hoverBorderColor: isDark ? '#404040' : '#40a9ff',
        activeBorderColor: primaryColor,
      },

      // Notification customizations - replaces antd.css lines 340-344
      Notification: {
        colorBgElevated: isDark ? '#262626' : '#ffffff',
        colorText: isDark ? '#E6E6E6' : '#262626',
        colorTextHeading: isDark ? '#E6E6E6' : '#262626',
        colorIcon: primaryColor,
        colorIconHover: isDark ? '#69A8E8' : '#40a9ff',
      },

      // Message customizations - replaces antd.css lines 346-351
      Message: {
        contentBg: isDark ? '#262626' : '#ffffff',
        contentPadding: '10px 16px',
        colorText: isDark ? '#E6E6E6' : '#262626',
        colorError: isDark ? '#FF6B6B' : '#ff4d4f',
        colorInfo: primaryColor,
        colorSuccess: '#52C41A',
        colorWarning: '#FAAD14',
      },

      // Alert customizations - replaces antd.css lines 354-356, 141-150
      Alert: {
        colorInfoBg: isDark ? 'rgba(74, 144, 226, 0.1)' : 'rgba(24, 144, 255, 0.1)',
        colorInfoBorder: isDark ? 'rgba(74, 144, 226, 0.3)' : 'rgba(24, 144, 255, 0.3)',
        colorInfoText: primaryColor,
        colorSuccessBg: 'rgba(82, 196, 26, 0.1)',
        colorSuccessBorder: 'rgba(82, 196, 26, 0.3)',
        colorSuccessText: '#52C41A',
        colorWarningBg: 'rgba(250, 173, 20, 0.1)',
        colorWarningBorder: 'rgba(250, 173, 20, 0.3)',
        colorWarningText: '#FAAD14',
        colorErrorBg: isDark ? 'rgba(255, 107, 107, 0.1)' : 'rgba(255, 77, 79, 0.1)',
        colorErrorBorder: isDark ? 'rgba(255, 107, 107, 0.3)' : 'rgba(255, 77, 79, 0.3)',
        colorErrorText: isDark ? '#FF6B6B' : '#ff4d4f',
        withDescriptionPadding: '20px 24px',
      },

      // Tooltip styles - replaces antd.css lines 358-366
      Tooltip: {
        colorBgDefault: isDark ? '#262626' : 'rgba(0, 0, 0, 0.75)',
        colorTextLightSolid: '#ffffff',
        paddingSM: '6px 8px',
      },

      // Empty state - replaces antd.css lines 368-371
      Empty: {
        colorText: isDark ? '#8C8C8C' : '#bfbfbf',
        colorTextDescription: isDark ? '#5A5A5A' : '#8c8c8c',
        fontSize,
      },

      // Pagination - replaces antd.css lines 378-395
      Pagination: {
        itemActiveBg: primaryColor,
        itemActiveBgDisabled: isDark ? '#303030' : '#f5f5f5',
        itemBg: isDark ? '#1F1F1F' : '#ffffff',
        itemInputBg: isDark ? '#1F1F1F' : '#ffffff',
        itemLinkBg: isDark ? '#1F1F1F' : '#ffffff',
        itemSize: 32,
        itemSizeSM: 24,
        colorPrimary: '#ffffff',
        colorPrimaryHover: '#ffffff',
        colorText: isDark ? '#E6E6E6' : '#262626',
        colorTextDisabled: isDark ? '#5A5A5A' : '#bfbfbf',
        colorBgContainer: isDark ? '#1F1F1F' : '#ffffff',
        colorBorderSecondary: isDark ? '#303030' : '#d9d9d9',
      },

      // Breadcrumb - replaces antd.css lines 397-404
      Breadcrumb: {
        colorText: isDark ? '#A6A6A6' : '#595959',
        colorTextDescription: isDark ? '#8C8C8C' : '#8c8c8c',
        fontSize,
        iconFontSize: fontSize,
        itemColor: isDark ? '#A6A6A6' : '#595959',
        lastItemColor: isDark ? '#E6E6E6' : '#262626',
        linkColor: primaryColor,
        linkHoverColor: isDark ? '#69A8E8' : '#40a9ff',
        separatorColor: isDark ? '#5A5A5A' : '#bfbfbf',
        separatorMargin: '0 8px',
      },

      // Progress - replaces antd.css lines 406-409
      Progress: {
        colorText: isDark ? '#E6E6E6' : '#262626',
        fontSize,
        lineBorderRadius: 100,
        defaultColor: primaryColor,
        remainingColor: isDark ? '#303030' : '#f0f0f0',
      },

      // Badge - replaces antd.css lines 411-427
      Badge: {
        colorError: isDark ? '#FF6B6B' : '#ff4d4f',
        colorSuccess: '#52C41A',
        colorWarning: '#FAAD14',
        colorInfo: primaryColor,
        dotSize: 8,
        fontSize,
        fontSizeSM: 12,
        statusSize: 8,
        textFontSize: fontSize,
        textFontSizeSM: 12,
        textFontWeight: 'normal',
      },

      // Divider - replaces antd.css lines 429-432
      Divider: {
        colorSplit: isDark ? '#303030' : '#f0f0f0',
        textPaddingInline: '1em',
        orientationMargin: 0.05,
        verticalMarginInline: 8,
      },

      // Steps - replaces antd.css lines 434-441
      Steps: {
        colorText: isDark ? '#E6E6E6' : '#262626',
        colorTextDescription: isDark ? '#A6A6A6' : '#8c8c8c',
        colorTextDisabled: isDark ? '#5A5A5A' : '#bfbfbf',
        colorSplit: isDark ? '#303030' : '#f0f0f0',
        colorPrimary: primaryColor,
        colorTextLightSolid: '#ffffff',
        dotSize: 8,
        iconSize: 32,
        iconFontSize: fontSize,
        titleLineHeight: 32,
      },

      // Checkbox - replaces inline fixes in antd.css lines 10-24
      Checkbox: {
        colorBgContainer: isDark ? '#1F1F1F' : '#ffffff',
        colorBorder: isDark ? '#303030' : '#d9d9d9',
        colorPrimary: primaryColor,
        colorWhite: '#ffffff',
        controlInteractiveSize: 16,
        borderRadiusSM: 4,
      },

      // Radio
      Radio: {
        buttonBg: isDark ? '#262626' : '#ffffff',
        buttonCheckedBg: primaryColor,
        buttonCheckedBgDisabled: isDark ? '#303030' : '#f5f5f5',
        buttonCheckedColorDisabled: isDark ? '#5A5A5A' : '#bfbfbf',
        buttonColor: isDark ? '#E6E6E6' : '#262626',
        buttonPaddingInline: 16,
        buttonSolidCheckedBg: primaryColor,
        buttonSolidCheckedColor: '#ffffff',
        buttonSolidCheckedHoverBg: isDark ? '#69A8E8' : '#40a9ff',
        colorBorder: isDark ? '#303030' : '#d9d9d9',
        colorPrimary: primaryColor,
        controlItemBgActive: isDark ? '#2A2A2A' : '#e6f4ff',
        controlItemBgActiveDisabled: isDark ? '#262626' : '#f5f5f5',
        controlItemBgActiveHover: isDark ? '#303030' : '#bae0ff',
        controlItemBgHover: isDark ? '#262626' : '#f5f5f5',
        dotColorDisabled: isDark ? '#5A5A5A' : '#bfbfbf',
        dotSize: 8,
        radioSize: 16,
        wrapperMarginInlineEnd: 8,
      },

      // Switch
      Switch: {
        colorPrimary: primaryColor,
        colorPrimaryHover: isDark ? '#69A8E8' : '#40a9ff',
        colorTextQuaternary: isDark ? '#5A5A5A' : '#bfbfbf',
        colorTextTertiary: isDark ? '#8C8C8C' : '#8c8c8c',
        handleBg: '#ffffff',
        handleSize: 18,
        handleSizeSM: 12,
        innerMaxMargin: 24,
        innerMinMargin: 6,
        trackHeight: 22,
        trackHeightSM: 16,
        trackMinWidth: 44,
        trackMinWidthSM: 28,
        trackPadding: 2,
      },

      // Statistic
      Statistic: {
        contentFontSize: 20,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        titleFontSize: fontSize,
      },

      // Descriptions
      Descriptions: {
        colorText: isDark ? '#E6E6E6' : '#262626',
        colorTextSecondary: isDark ? '#A6A6A6' : '#595959',
        colorSplit: isDark ? '#303030' : '#f0f0f0',
        itemPaddingBottom: 16,
        labelBg: isDark ? '#262626' : '#fafafa',
        titleColor: isDark ? '#E6E6E6' : '#262626',
        titleFontSize: 16,
        titleMarginBottom: 20,
      },

      // Tag
      Tag: {
        colorBorder: isDark ? '#303030' : '#d9d9d9',
        colorBorderSecondary: isDark ? '#303030' : '#f0f0f0',
        colorFillQuaternary: isDark ? '#262626' : '#fafafa',
        colorFillSecondary: isDark ? '#303030' : '#f5f5f5',
        colorFillTertiary: isDark ? '#2A2A2A' : '#f0f0f0',
        colorText: isDark ? '#E6E6E6' : '#262626',
        colorTextDescription: isDark ? '#A6A6A6' : '#595959',
        colorTextHeading: isDark ? '#E6E6E6' : '#262626',
        defaultBg: isDark ? '#262626' : '#fafafa',
        defaultColor: isDark ? '#E6E6E6' : '#262626',
        fontSize,
        fontSizeIcon: 12,
        fontSizeSM: 12,
        lineWidth: 1,
      },

      // Typography
      Typography: {
        colorLink: primaryColor,
        colorLinkActive: isDark ? '#2E7CD6' : '#096dd9',
        colorLinkHover: isDark ? '#69A8E8' : '#40a9ff',
        colorText: isDark ? '#E6E6E6' : '#262626',
        colorTextDescription: isDark ? '#A6A6A6' : '#595959',
        colorTextDisabled: isDark ? '#5A5A5A' : '#bfbfbf',
        colorTextHeading: isDark ? '#E6E6E6' : '#262626',
        colorTextSecondary: isDark ? '#A6A6A6' : '#595959',
        fontSizeHeading1: 38,
        fontSizeHeading2: 30,
        fontSizeHeading3: 24,
        fontSizeHeading4: 20,
        fontSizeHeading5: 16,
        fontWeightStrong: 600,
        lineHeightHeading1: 1.23,
        lineHeightHeading2: 1.35,
        lineHeightHeading3: 1.35,
        lineHeightHeading4: 1.4,
        lineHeightHeading5: 1.5,
        marginBottom: '0.5em',
        marginTop: '1.2em',
      },
    },
  };
};

/**
 * Export preset themes
 */
export const darkTheme = createUnifiedTheme({ mode: 'dark' });
export const lightTheme = createUnifiedTheme({ mode: 'light' });

/**
 * Default export for convenience
 */
export default createUnifiedTheme;