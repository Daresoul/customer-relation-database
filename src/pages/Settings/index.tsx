import React from 'react';
import { Spin, Layout } from 'antd';
import { useTranslation } from 'react-i18next';
import { useAppSettings } from '../../hooks/useAppSettings';
import { useThemeColors } from '../../utils/themeStyles';
import SettingsLayout from './SettingsLayout';

const { Content } = Layout;

const Settings: React.FC = () => {
  const { t } = useTranslation(['common']);
  const themeColors = useThemeColors();
  const { isLoading } = useAppSettings();

  if (isLoading) {
    return (
      <Content style={{ padding: 24, textAlign: 'center', background: themeColors.background, minHeight: '100vh' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16, color: themeColors.text }}>{t('common:loadingData')}</div>
      </Content>
    );
  }

  return <SettingsLayout />;
};

export default Settings;