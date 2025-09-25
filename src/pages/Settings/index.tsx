import React from 'react';
import { Layout, Card, Form, Select, Button, Space, Divider, Typography, Spin, message, Breadcrumb } from 'antd';
import { SettingOutlined, GlobalOutlined, DollarOutlined, BgColorsOutlined, HomeOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAppSettings } from '../../hooks/useAppSettings';
import { useCurrencies } from '../../hooks/useCurrencies';
import { useNavigate, Link } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import { useThemeColors } from '../../utils/themeStyles';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

const Settings: React.FC = () => {
  const { t } = useTranslation(['common', 'entities', 'navigation']);
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const { themeMode, setThemeMode } = useTheme();
  const themeColors = useThemeColors();

  const { settings, updateSettings, isLoading, isUpdating } = useAppSettings();
  const { data: currencies, isLoading: currenciesLoading } = useCurrencies();

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

  const handleSubmit = async (values: any) => {
    console.log('Settings form values:', values);
    console.log('Current settings before update:', settings);

    // Ensure all values are sent, not just changed ones
    // Fix: Use !== undefined to preserve falsy values like 0
    const completeValues = {
      language: values.language !== undefined ? values.language : (settings?.language || 'en'),
      currencyId: values.currencyId !== undefined ? values.currencyId : settings?.currencyId,
      theme: values.theme !== undefined ? values.theme : (settings?.theme || 'light'),
      dateFormat: values.dateFormat !== undefined ? values.dateFormat : (settings?.dateFormat || 'MM/DD/YYYY')
    };

    console.log('Sending complete values:', completeValues);

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

  if (isLoading) {
    return (
      <Content style={{ padding: 24, textAlign: 'center', background: themeColors.background, minHeight: '100vh' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16, color: themeColors.text }}>{t('common:loadingData')}</div>
      </Content>
    );
  }

  return (
    <Content style={{ padding: 24, background: themeColors.background, minHeight: '100vh' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        {/* Breadcrumb */}
        <div style={{ marginBottom: 16 }}>
          <Breadcrumb
            items={[
              {
                title: <Link to="/" style={{ color: '#4A90E2' }}><HomeOutlined /> {t('navigation:home')}</Link>,
              },
              {
                title: <Link to="/" style={{ color: '#4A90E2' }}>{t('navigation:dashboard')}</Link>,
              },
              {
                title: <span style={{ color: themeColors.text }}>{t('navigation:settings')}</span>,
              },
            ]}
          />
        </div>

        {/* Back Button */}
        <div style={{ marginBottom: 16 }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(-1)}
            style={{ background: themeColors.containerBg, borderColor: themeColors.border }}
          >
            {t('common:back')}
          </Button>
        </div>

        {/* Title */}
        <Card
          style={{
            background: themeColors.cardBg,
            borderColor: themeColors.border,
            marginBottom: 24
          }}
        >
          <Title level={2} style={{ color: themeColors.text, margin: 0 }}>
            <SettingOutlined /> {t('navigation:settings')}
          </Title>
          <Text style={{ color: themeColors.textSecondary }}>{t('common:settings')}</Text>
        </Card>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
      >
        <Card
          title={
            <span style={{ color: themeColors.text }}>
              <GlobalOutlined /> {t('common:language')}
            </span>
          }
          style={{
            marginBottom: 16,
            background: themeColors.cardBg,
            borderColor: themeColors.border
          }}
        >
          <Form.Item
            name="language"
            label={<span style={{ color: themeColors.text }}>{t('common:language')}</span>}
            rules={[{ required: true, message: t('forms:validation.required') }]}
          >
            <Select
              size="large"
              style={{ width: '100%' }}
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
            <span style={{ color: themeColors.text }}>
              <DollarOutlined /> {t('common:currency')}
            </span>
          }
          style={{
            marginBottom: 16,
            background: themeColors.cardBg,
            borderColor: themeColors.border
          }}
        >
          <Form.Item
            name="currencyId"
            label={<span style={{ color: themeColors.text }}>{t('common:currency')}</span>}
            extra={<span style={{ color: themeColors.textSecondary }}>Default currency for new procedures</span>}
          >
            <Select
              size="large"
              allowClear
              placeholder={t('common:selectPlaceholder')}
              loading={currenciesLoading}
              showSearch
              optionFilterProp="children"
              filterOption={(input, option) =>
                (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
              }
              style={{ width: '100%' }}
            >
              {currencies?.map((currency) => (
                <Option
                  key={currency.id}
                  value={currency.id}
                  label={`${currency.code} - ${currency.name}`}
                >
                  {currency.symbol && <span>{currency.symbol} </span>}
                  {currency.code} - {currency.name}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Card>

        <Card
          title={
            <span style={{ color: themeColors.text }}>
              <BgColorsOutlined /> {t('common:theme')}
            </span>
          }
          style={{
            marginBottom: 16,
            background: themeColors.cardBg,
            borderColor: themeColors.border
          }}
        >
          <Form.Item
            name="theme"
            label={<span style={{ color: themeColors.text }}>{t('common:theme')}</span>}
            rules={[{ required: true, message: t('forms:validation.required') }]}
          >
            <Select
              size="large"
              style={{ width: '100%' }}
            >
              <Option value="light">☀️ Light</Option>
              <Option value="dark">🌙 Dark</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="dateFormat"
            label={<span style={{ color: themeColors.text }}>{t('common:dateFormat')}</span>}
            rules={[{ required: true, message: t('forms:validation.required') }]}
          >
            <Select
              size="large"
              style={{ width: '100%' }}
            >
              <Option value="MM/DD/YYYY">MM/DD/YYYY (01/31/2024)</Option>
              <Option value="DD/MM/YYYY">DD/MM/YYYY (31/01/2024)</Option>
              <Option value="YYYY-MM-DD">YYYY-MM-DD (2024-01-31)</Option>
            </Select>
          </Form.Item>
        </Card>

        <Form.Item style={{ marginTop: 24 }}>
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
              style={{ background: themeColors.containerBg, borderColor: themeColors.border }}
            >
              {t('common:cancel')}
            </Button>
          </Space>
        </Form.Item>
      </Form>
      </div>
    </Content>
  );
};

export default Settings;