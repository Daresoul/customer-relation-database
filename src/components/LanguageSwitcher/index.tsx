import React from 'react';
import { Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { useAppSettings } from '../../hooks/useAppSettings';

const { Option } = Select;

export const LanguageSwitcher: React.FC = () => {
  const { i18n, t } = useTranslation('entities');
  const { settings, updateSettings, isLoading } = useAppSettings();

  const handleLanguageChange = (language: 'en' | 'mk') => {
    updateSettings({ language });
  };

  return (
    <Select
      value={settings?.language || i18n.language}
      onChange={handleLanguageChange}
      loading={isLoading}
      style={{ width: 150 }}
    >
      <Option value="en">
        <span role="img" aria-label="English">🇬🇧</span> {t('languages.en')}
      </Option>
      <Option value="mk">
        <span role="img" aria-label="Macedonian">🇲🇰</span> {t('languages.mk')}
      </Option>
    </Select>
  );
};