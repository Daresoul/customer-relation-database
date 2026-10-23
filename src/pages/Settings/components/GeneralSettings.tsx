import React from 'react';
import { App, Card, Form, Select, Switch, Typography } from 'antd';
import { GlobalOutlined, BgColorsOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../../utils/themeStyles';
import styles from '../Settings.module.css';
import { invoke } from '@/services/invoke';
import { markAutostartDefaultApplied } from '../../../utils/autostart';

const { Text } = Typography;
const { Option } = Select;

interface GeneralSettingsProps {
  isUpdating: boolean;
}

const GeneralSettings: React.FC<GeneralSettingsProps> = ({ isUpdating }) => {
  const { t } = useTranslation(['common', 'forms']);
  const themeColors = useThemeColors();
  const { message } = App.useApp();
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
      await invoke(checked ? 'plugin:autostart|enable' : 'plugin:autostart|disable');
      markAutostartDefaultApplied();
    } catch (_) {
      setLaunchAtLogin(!checked);
      message.error(t('settings:general.launchAtLoginFailed'));
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
        <Form.Item label={<span className={styles.formLabel}>{t('settings:general.launchAtLogin')}</span>}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Switch
              checked={launchAtLogin}
              onChange={onToggleLaunchAtLogin}
              disabled={isUpdating}
              aria-label={t('settings:general.launchAtLogin')}
            />
            <Text type="secondary">{t('settings:general.launchAtLoginHint')}</Text>
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
              <span role="img" aria-label={t('entities:languages.en')}>🇬🇧</span> English
            </Option>
            <Option value="mk">
              <span role="img" aria-label={t('entities:languages.mk')}>🇲🇰</span> Македонски
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
            <Option value="light">☀️ {t('entities:themes.light')}</Option>
            <Option value="dark">🌙 {t('entities:themes.dark')}</Option>
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
