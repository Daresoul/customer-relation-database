import React from 'react';
import { Card, Form, Select, Typography } from 'antd';
import { DollarOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../../utils/themeStyles';
import { useCurrencies } from '../../../hooks/useCurrencies';

const { Text } = Typography;
const { Option } = Select;

interface BusinessSettingsProps {
  form: any;
  isUpdating: boolean;
}

const BusinessSettings: React.FC<BusinessSettingsProps> = ({ form, isUpdating }) => {
  const { t } = useTranslation(['common', 'forms']);
  const themeColors = useThemeColors();
  const { data: currencies, isLoading: currenciesLoading } = useCurrencies();

  return (
    <div>
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
            disabled={isUpdating}
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
    </div>
  );
};

export default BusinessSettings;