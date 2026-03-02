import React from 'react';
import { Card, Form, Select, Typography } from 'antd';
import { GlobalOutlined, BgColorsOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../../utils/themeStyles';
import styles from '../Settings.module.css';
import { invoke } from '@tauri-apps/api/tauri';

const { Text } = Typography;
const { Option } = Select;

interface GeneralSettingsProps {
  isUpdating: boolean;
}

const GeneralSettings: React.FC<GeneralSettingsProps> = ({ isUpdating }) => {
  const { t } = useTranslation(['common', 'forms']);
  const themeColors = useThemeColors();
  const [launchAtLogin, setLaunchAtLogin] = React.useState<boolean>(false);

  React.useEffect(() => {
    (async () => {
      try {
        const enabled = await invoke<boolean>('plugin:autostart|is_enabled');
        setLaunchAtLogin(!!enabled);
      } catch (_) {
        setLaunchAtLogin(false);
      }
    })();
  }, []);

  const onToggleLaunchAtLogin = async (checked: boolean) => {
    setLaunchAtLogin(checked);
    try {
      if (checked) {
        await invoke('plugin:autostart|enable');
      } else {
        await invoke('plugin:autostart|disable');
      }
    } catch (_) {
      // ignore
    }
  };

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
        <Form.Item label={<span className={styles.formLabel}>Launch at Login</span>}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={launchAtLogin}
              onChange={(e) => onToggleLaunchAtLogin(e.target.checked)}
              disabled={isUpdating}
            />
            <Text type="secondary">Start the app minimized to tray on system startup</Text>
          </div>
        </Form.Item>

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
