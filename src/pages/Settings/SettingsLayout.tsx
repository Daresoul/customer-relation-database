import React, { useState } from 'react';
import { Layout, Menu, Card, Form, Button, Space, Breadcrumb, App } from 'antd';
import {
  SettingOutlined,
  GlobalOutlined,
  DollarOutlined,
  CalendarOutlined,
  HomeOutlined,
  ArrowLeftOutlined,
  BankOutlined,
  CloudDownloadOutlined,
  CloudUploadOutlined,
  AppstoreOutlined,
  UsbOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import { useThemeColors } from '../../utils/themeStyles';
import { useAppSettings } from '../../hooks/useAppSettings';
import { useTheme } from '../../contexts/ThemeContext';
import { DeviceStatusInline } from '../../components/DeviceStatusBar';
import styles from './Settings.module.css';

// Import category components
import GeneralSettings from './components/GeneralSettings';
import BusinessSettings from './components/BusinessSettings';
import AppointmentsSettings from './components/AppointmentsSettings';
import RoomsSettings from './components/RoomsSettings';
import SpeciesSettings from './components/SpeciesSettings';
import DeviceInputSettings from './components/DeviceInputSettings';
import DeviceFilesSettings from './components/DeviceFilesSettings';
import RecordTemplatesSettings from './components/RecordTemplatesSettings';
import LineItemsSettings from './components/LineItemsSettings';
import DiagnosesSettings from './components/DiagnosesSettings';
import BackupSettings from './components/BackupSettings';
import ManagedScannersSettings from './components/ManagedScannersSettings';
import { UpdateSettings } from './UpdateSettings';

const { Content, Sider } = Layout;

type SettingsCategory = 'general' | 'business' | 'appointments' | 'rooms' | 'species' | 'devices' | 'managedScanners' | 'deviceFiles' | 'templates' | 'lineItems' | 'diagnoses' | 'backups' | 'updates';

interface MenuItem {
  key: SettingsCategory;
  icon: React.ReactNode;
  label: string;
  component: React.ComponentType<any>;
}

const SettingsLayout: React.FC = () => {
  const { notification } = App.useApp();
  const { t } = useTranslation(['common', 'entities', 'navigation', 'forms', 'settings']);
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
      label: t('settings:sections.general'),
      component: GeneralSettings,
    },
    {
      key: 'business',
      icon: <DollarOutlined />,
      label: t('settings:sections.business'),
      component: BusinessSettings,
    },
    {
      key: 'appointments',
      icon: <CalendarOutlined />,
      label: t('settings:sections.appointments'),
      component: AppointmentsSettings,
    },
    {
      key: 'rooms',
      icon: <BankOutlined />,
      label: t('settings:sections.rooms'),
      component: RoomsSettings,
    },
    {
      key: 'species',
      icon: <AppstoreOutlined />,
      label: t('settings:sections.species'),
      component: SpeciesSettings,
    },
    {
      key: 'devices',
      icon: <UsbOutlined />,
      label: t('settings:sections.devices'),
      component: DeviceInputSettings,
    },
    {
      key: 'managedScanners',
      icon: <UsbOutlined />,
      label: t('settings:sections.managedScanners', 'Managed Scanners'),
      component: ManagedScannersSettings,
    },
    {
      key: 'deviceFiles',
      icon: <FolderOpenOutlined />,
      label: t('settings:sections.deviceFiles', 'Device Files'),
      component: DeviceFilesSettings,
    },
    {
      key: 'templates',
      icon: <FileTextOutlined />,
      label: t('settings:sections.templates'),
      component: RecordTemplatesSettings,
    },
    {
      key: 'lineItems',
      icon: <DollarOutlined />,
      label: t('settings:sections.lineItems'),
      component: LineItemsSettings,
    },
    {
      key: 'diagnoses',
      // Re-use FileTextOutlined to match the templates tab's visual
      // family — both are "managed lists of editable terms".
      icon: <FileTextOutlined />,
      label: t('settings:sections.diagnoses', 'Diagnoses'),
      component: DiagnosesSettings,
    },
    {
      key: 'backups',
      icon: <CloudUploadOutlined />,
      label: t('settings:sections.backups', 'Backups'),
      component: BackupSettings,
    },
    {
      key: 'updates',
      icon: <CloudDownloadOutlined />,
      label: t('settings:sections.updates'),
      component: UpdateSettings,
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

      notification.success({ message: "Success", description: t('common:saveSuccess'), placement: "bottomRight", duration: 3 });
    } catch (error) {
      console.error('Settings update error:', error);
      notification.error({ message: "Error", description: t('common:operationFailed'), placement: "bottomRight", duration: 5 });
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
            <div className={styles.breadcrumbRow}>
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
              <DeviceStatusInline />
            </div>
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
              {/* Rooms, Species, Devices, Templates, LineItems and Updates tabs don't need the parent form - they manage their own state */}
              {selectedCategory === 'rooms' || selectedCategory === 'species' || selectedCategory === 'devices' || selectedCategory === 'deviceFiles' || selectedCategory === 'templates' || selectedCategory === 'lineItems' || selectedCategory === 'backups' || selectedCategory === 'updates' ? (
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