import React from 'react';
import { Card, Form, Select, Typography } from 'antd';
import { GlobalOutlined, BgColorsOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../../utils/themeStyles';
import styles from '../Settings.module.css';

const { Text } = Typography;
const { Option } = Select;

interface GeneralSettingsProps {
  form: any;
  isUpdating: boolean;
}

const GeneralSettings: React.FC<GeneralSettingsProps> = ({ form, isUpdating }) => {
  const { t } = useTranslation(['common', 'forms']);
  const themeColors = useThemeColors();

  return (
    <div>
      <Card
        title={
          <span className={styles.cardTitle}>
            <GlobalOutlined /> {t('common:language')}
          </span>
        }
        className={styles.settingsCard}
      >
        <Form.Item
          name="language"
          label={<span className={styles.formLabel}>{t('common:language')}</span>}
          rules={[{ required: true, message: t('forms:validation.required') }]}
        >
          <Select
            size="large"
            className={styles.fullWidth}
            disabled={isUpdating}
          >
            <Option value="en">
              <span role="img" aria-label="English">🇬🇧</span> English
            </Option>
            <Option value="mk">
              <span role="img" aria-label="Macedonian">🇲🇰</span> Македонски
            </Option>
          </Select>
        </Form.Item>
      </Card>

      <Card
        title={
          <span className={styles.cardTitle}>
            <BgColorsOutlined /> {t('common:theme')}
          </span>
        }
        className={styles.settingsCard}
      >
        <Form.Item
          name="theme"
          label={<span className={styles.formLabel}>{t('common:theme')}</span>}
          rules={[{ required: true, message: t('forms:validation.required') }]}
        >
          <Select
            size="large"
            className={styles.fullWidth}
            disabled={isUpdating}
          >
            <Option value="light">☀️ Light</Option>
            <Option value="dark">🌙 Dark</Option>
          </Select>
        </Form.Item>

        <Form.Item
          name="dateFormat"
          label={<span className={styles.formLabel}>{t('common:dateFormat')}</span>}
          rules={[{ required: true, message: t('forms:validation.required') }]}
        >
          <Select
            size="large"
            className={styles.fullWidth}
            disabled={isUpdating}
          >
            <Option value="MM/DD/YYYY">MM/DD/YYYY (01/31/2024)</Option>
            <Option value="DD/MM/YYYY">DD/MM/YYYY (31/01/2024)</Option>
            <Option value="YYYY-MM-DD">YYYY-MM-DD (2024-01-31)</Option>
          </Select>
        </Form.Item>
      </Card>
    </div>
  );
};

export default GeneralSettings;