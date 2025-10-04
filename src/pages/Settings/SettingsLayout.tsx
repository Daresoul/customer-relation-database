import React, { useState } from 'react';
import { Layout, Menu, Card, Form, Button, Space, Typography, Breadcrumb, message } from 'antd';
import {
  SettingOutlined,
  GlobalOutlined,
  DollarOutlined,
  CalendarOutlined,
  HomeOutlined,
  ArrowLeftOutlined,
  BankOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import { useThemeColors } from '../../utils/themeStyles';
import { useAppSettings } from '../../hooks/useAppSettings';
import { useTheme } from '../../contexts/ThemeContext';
import styles from './Settings.module.css';

// Import category components
import GeneralSettings from './components/GeneralSettings';
import BusinessSettings from './components/BusinessSettings';
import AppointmentsSettings from './components/AppointmentsSettings';
import RoomsSettings from './components/RoomsSettings';

const { Content, Sider } = Layout;
const { Title, Text } = Typography;

type SettingsCategory = 'general' | 'business' | 'appointments' | 'rooms';

interface MenuItem {
  key: SettingsCategory;
  icon: React.ReactNode;
  label: string;
  component: React.ComponentType<any>;
}

const SettingsLayout: React.FC = () => {
  const { t } = useTranslation(['common', 'entities', 'navigation', 'forms']);
  const navigate = useNavigate();
  const { themeMode, setThemeMode } = useTheme();
  const themeColors = useThemeColors();
  const [selectedCategory, setSelectedCategory] = useState<SettingsCategory>('general');

  // Only create form for tabs that need it (not for rooms tab which has its own form)
  const [form] = Form.useForm();

  const { settings, updateSettings, isLoading, isUpdating } = useAppSettings();

  // Define menu items
  const menuItems: MenuItem[] = [
    {
      key: 'general',
      icon: <GlobalOutlined />,
      label: 'General',
      component: GeneralSettings,
    },
    {
      key: 'business',
      icon: <DollarOutlined />,
      label: 'Business',
      component: BusinessSettings,
    },
    {
      key: 'appointments',
      icon: <CalendarOutlined />,
      label: 'Appointments',
      component: AppointmentsSettings,
    },
    {
      key: 'rooms',
      icon: <BankOutlined />,
      label: 'Rooms',
      component: RoomsSettings,
    },
  ];

  React.useEffect(() => {
    if (settings) {
      form.setFieldsValue({
        language: settings.language,
        currencyId: settings.currencyId,
        theme: settings.theme,
        dateFormat: settings.dateFormat,
        googleCalendarSync: settings.googleCalendarSync || false,
      });
    }
  }, [settings, form]);

  const handleSubmit = async (values: any) => {

    // Ensure all values are sent, not just changed ones
    const completeValues = {
      language: values.language !== undefined ? values.language : (settings?.language || 'en'),
      currencyId: values.currencyId !== undefined ? values.currencyId : settings?.currencyId,
      theme: values.theme !== undefined ? values.theme : (settings?.theme || 'light'),
      dateFormat: values.dateFormat !== undefined ? values.dateFormat : (settings?.dateFormat || 'MM/DD/YYYY'),
      googleCalendarSync: values.googleCalendarSync || false,
    };


    try {
      await updateSettings(completeValues);

      // Update the theme context when theme changes
      if (completeValues.theme && completeValues.theme !== themeMode) {
        setThemeMode(completeValues.theme as 'light' | 'dark');
      }

      message.success(t('common:saveSuccess'));
    } catch (error) {
      console.error('Settings update error:', error);
      message.error(t('common:operationFailed'));
    }
  };

  const handleCancel = () => {
    navigate(-1);
  };

  const currentMenuItem = menuItems.find(item => item.key === selectedCategory);
  const CurrentComponent = currentMenuItem?.component || GeneralSettings;

  return (
    <Layout className={styles.container}>
      <Content className={styles.content}>
        <div className={styles.contentWrapper}>
          {/* Breadcrumb */}
          <div className={styles.section}>
            <Breadcrumb
              items={[
                {
                  title: <Link to="/" className={styles.breadcrumbLink}><HomeOutlined /> {t('navigation:home')}</Link>,
                },
                {
                  title: <Link to="/" className={styles.breadcrumbLink}>{t('navigation:dashboard')}</Link>,
                },
                {
                  title: <span className={styles.breadcrumbCurrent}>{t('navigation:settings')}</span>,
                },
              ]}
            />
          </div>

          {/* Back Button */}
          <div className={styles.header}>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(-1)}
              className={styles.backButton}
            >
              {t('common:back')}
            </Button>
          </div>

          {/* Title */}
          <Card
            className={styles.titleCard}
          >
            <Title level={2} className={styles.title}>
              <SettingOutlined /> {t('navigation:settings')}
            </Title>
            <Text className={styles.subtitle}>{t('common:settings')}</Text>
          </Card>

          {/* Main Layout */}
          <Layout className={styles.settingsLayout}>
            {/* Side Menu */}
            <Sider
              width={250}
              className={styles.sidebar}
            >
              <Menu
                mode="inline"
                selectedKeys={[selectedCategory]}
                onClick={({ key }) => setSelectedCategory(key as SettingsCategory)}
                className={styles.sidebarMenu}
                items={menuItems.map(item => ({
                  key: item.key,
                  icon: item.icon,
                  label: item.label,
                }))}
              />
            </Sider>

            {/* Content Area */}
            <Content className={styles.settingsContent}>
              {/* Rooms tab doesn't need the parent form - it has its own modal form */}
              {selectedCategory === 'rooms' ? (
                <CurrentComponent isUpdating={isUpdating} />
              ) : (
                <Form
                  form={form}
                  layout="vertical"
                  onFinish={handleSubmit}
                >
                  {/* Dynamic content based on selected category */}
                  <CurrentComponent isUpdating={isUpdating} />

                  {/* Save/Cancel buttons - always visible */}
                  <Card
                    className={styles.saveCard}
                  >
                    <Form.Item className={styles.formAction}>
                      <Space>
                        <Button
                          type="primary"
                          htmlType="submit"
                          loading={isUpdating}
                          size="large"
                          icon={<SettingOutlined />}
                        >
                          {t('common:saveChanges')}
                        </Button>
                        <Button
                          onClick={handleCancel}
                          size="large"
                          className={styles.cancelButton}
                        >
                          {t('common:cancel')}
                        </Button>
                      </Space>
                    </Form.Item>
                  </Card>
                </Form>
              )}
            </Content>
          </Layout>
        </div>
      </Content>
    </Layout>
  );
};

export default SettingsLayout;