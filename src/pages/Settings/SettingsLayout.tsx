import React from 'react';
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
  ShopOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAppSettings } from '../../hooks/useAppSettings';
import type { UpdateSettingsRequest } from '../../services/settingsService';
import { useTheme } from '../../contexts/useTheme';
import styles from './Settings.module.css';

// Import category components
import GeneralSettings from './components/GeneralSettings';
import BusinessSettings from './components/BusinessSettings';
import ClinicSettings from './components/ClinicSettings';
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
import { LoadError } from '../../components/common/LoadError';

const { Content, Sider } = Layout;

type SettingsCategory = 'general' | 'clinic' | 'business' | 'appointments' | 'rooms' | 'species' | 'devices' | 'managedScanners' | 'deviceFiles' | 'templates' | 'lineItems' | 'diagnoses' | 'backups' | 'updates';

// Sections a link can open with `/settings?section=<key>`.
const LINKABLE_SECTIONS: readonly string[] = ['general', 'clinic', 'business', 'appointments', 'rooms', 'species', 'devices', 'managedScanners', 'deviceFiles', 'templates', 'lineItems', 'diagnoses', 'backups', 'updates'];

interface MenuItem {
  key: SettingsCategory;
  icon: React.ReactNode;
  label: string;
  component: React.ComponentType<{ isUpdating: boolean }>;
}

const SettingsLayout: React.FC = () => {
  const { message } = App.useApp();
  const { t } = useTranslation(['common', 'entities', 'navigation', 'forms', 'settings']);
  const navigate = useNavigate();
  const { themeMode, setThemeMode } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('section');
  // The URL holds the section, so a link (the backup light) opens it even while Settings is open.
  const selectedCategory: SettingsCategory =
    requested && LINKABLE_SECTIONS.includes(requested) ? (requested as SettingsCategory) : 'general';

  // Only create form for tabs that need it (not for rooms tab which has its own form)
  const [form] = Form.useForm();

  const { settings, updateSettings, isUpdating, error: loadError, refetch, isRefetching } = useAppSettings();

  // Define menu items
  const menuItems: MenuItem[] = [
    {
      key: 'general',
      icon: <GlobalOutlined />,
      label: t('settings:sections.general'),
      component: GeneralSettings,
    },
    {
      key: 'clinic',
      icon: <ShopOutlined />,
      label: t('settings:sections.clinic'),
      component: ClinicSettings,
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
      });
    }
  }, [settings, form]);

  const handleSubmit = async (values: Partial<UpdateSettingsRequest>) => {

    // Ensure all values are sent, not just changed ones
    const completeValues = {
      language: values.language !== undefined ? values.language : (settings?.language || 'en'),
      // The currency field lives on the Business section; cleared there, it is undefined and saves as null.
      currencyId: selectedCategory === 'business' ? (values.currencyId ?? null) : (settings?.currencyId ?? null),
      theme: values.theme !== undefined ? values.theme : (settings?.theme || 'light'),
      dateFormat: values.dateFormat !== undefined ? values.dateFormat : (settings?.dateFormat || 'DD.MM.YYYY'),
    };


    try {
      await updateSettings(completeValues);
    } catch {
      // useAppSettings already reported the failure
      return;
    }

    if (completeValues.theme && completeValues.theme !== themeMode) {
      setThemeMode(completeValues.theme as 'light' | 'dark');
    }
    message.success(t('common:saveSuccess'));
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
                onClick={({ key }) => setSearchParams({ section: key }, { replace: true })}
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
              {selectedCategory === 'clinic' || selectedCategory === 'rooms' || selectedCategory === 'species' || selectedCategory === 'devices' || selectedCategory === 'deviceFiles' || selectedCategory === 'templates' || selectedCategory === 'lineItems' || selectedCategory === 'backups' || selectedCategory === 'updates' ? (
                <CurrentComponent isUpdating={isUpdating} />
              ) : loadError && !settings ? (
                // No made-up defaults: Save would write them over the real settings.
                <LoadError title={t('settings:loadFailed')} onRetry={() => refetch?.()} retrying={isRefetching} />
              ) : (
                <Form scrollToFirstError={{ focus: true }}
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